"""
cargar_datos_minsa.py
=====================
Script de carga de los datasets MINSA limpios a PostgreSQL.
Asume que la migración 002_modelo_epidemiologico.sql ya fue aplicada.

Flujo
-----
  Fase A — Poblar catálogos (departamento, provincia, distrito,
            periodo_epidemiologico, direccion_salud) con los valores
            que aparezcan en los datos limpios. Usa UPSERT (INSERT ... ON CONFLICT DO NOTHING)
            para ser idempotente.

  Fase B — Insertar hechos (caso_eda, caso_ira_neumonia, caso_ira_no_neumonia,
            caso_dengue). También idempotente via ON CONFLICT DO NOTHING
            sobre la clave natural única de cada tabla.

  Fase C — Registrar la ejecución en control_carga.

Modo de operación
-----------------
  HISTORICO: carga todos los registros de los 4 CSV limpios.
  SEMANAL:   carga solo los registros del año y semana indicados.
             Usar --anio y --semana para filtrarlo.

Credenciales
------------
  Se leen EXCLUSIVAMENTE desde variables de entorno o archivo .env en el
  directorio de infraestructura. NUNCA se hardcodean en este script.
  Variables esperadas (mismas que infrastructure/.env.example):
    POSTGRES_HOST     (default: postgres — nombre del servicio Docker)
    POSTGRES_PORT     (default: 5432)
    POSTGRES_DB       (default: healthradar_db)
    POSTGRES_USER
    POSTGRES_PASSWORD

Uso
---
  # Carga histórica completa (todos los años)
  python cargar_datos_minsa.py --modo HISTORICO

  # Carga semanal (solo semana 35 del año 2026)
  python cargar_datos_minsa.py --modo SEMANAL --anio 2026 --semana 35

Requisitos
----------
  pip install pandas psycopg2-binary python-dotenv
"""

import argparse
import datetime
import os
import sys
from pathlib import Path
from typing import Dict, Optional, Tuple

import pandas as pd
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# CONFIGURACION
# ---------------------------------------------------------------------------

# Ruta del proyecto (2 niveles arriba de este script: src/database/ → raíz)
PROJECT_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE     = PROJECT_ROOT / "infrastructure" / ".env"

# Directorio donde quedaron los CSV limpios del script de limpieza
DOWNLOADS_DIR   = Path.home() / "Downloads"
OUTPUT_DIR      = DOWNLOADS_DIR / "minsa_limpieza_output"

CLEAN_FILES = {
    "eda":             OUTPUT_DIR / "limpio_eda.csv",
    "ira_neumonia":    OUTPUT_DIR / "limpio_ira_neumonia.csv",
    "ira_no_neumonia": OUTPUT_DIR / "limpio_ira_no_neumonia.csv",
    "dengue":          OUTPUT_DIR / "limpio_dengue.csv",
}

# Tamaño del batch para inserción masiva (ajustable según RAM de la VM)
BATCH_SIZE = 5_000

# ---------------------------------------------------------------------------
# CONEXIÓN A POSTGRESQL
# ---------------------------------------------------------------------------

def cargar_env() -> None:
    """Carga variables de entorno desde infrastructure/.env si existe."""
    if ENV_FILE.exists():
        load_dotenv(ENV_FILE)
        print(f"  Variables de entorno cargadas desde: {ENV_FILE}")
    else:
        print(f"  Archivo .env no encontrado en {ENV_FILE}.")
        print("  Se usarán las variables de entorno del sistema.")


def obtener_conexion() -> psycopg2.extensions.connection:
    """
    Construye la cadena de conexión desde variables de entorno.
    Falla explícitamente si POSTGRES_USER o POSTGRES_PASSWORD no están definidas.
    """
    host     = os.getenv("POSTGRES_HOST", "postgres")
    port     = os.getenv("POSTGRES_PORT", "5432")
    dbname   = os.getenv("POSTGRES_DB",   "healthradar_db")
    user     = os.getenv("POSTGRES_USER")
    password = os.getenv("POSTGRES_PASSWORD")

    if not user or not password:
        print(
            "ERROR — POSTGRES_USER y/o POSTGRES_PASSWORD no definidas.\n"
            "Asegúrate de tener un archivo infrastructure/.env con esas variables\n"
            "o de exportarlas en el entorno antes de ejecutar este script."
        )
        sys.exit(1)

    try:
        conn = psycopg2.connect(
            host=host, port=port, dbname=dbname,
            user=user, password=password,
            connect_timeout=10,
        )
        conn.autocommit = False
        print(f"  Conectado a PostgreSQL: {host}:{port}/{dbname} (usuario: {user})")
        return conn
    except psycopg2.OperationalError as e:
        print(f"ERROR — No se pudo conectar a PostgreSQL: {e}")
        sys.exit(1)


# ---------------------------------------------------------------------------
# LECTURA DE CSV LIMPIOS
# ---------------------------------------------------------------------------

def leer_limpios(modo: str, anio: Optional[int],
                 semana: Optional[int]) -> Dict[str, pd.DataFrame]:
    """
    Lee los 4 CSV limpios. En modo SEMANAL filtra por anio+semana.
    Verifica que los archivos existen antes de leer.
    """
    errores = []
    for clave, path in CLEAN_FILES.items():
        if not path.exists():
            errores.append(f"  x [{clave}] No encontrado: {path}")
    if errores:
        print("ERROR — archivos limpios faltantes (¿corriste limpiar_datasets_minsa.py?):")
        for e in errores:
            print(e)
        sys.exit(1)

    datos: Dict[str, pd.DataFrame] = {}
    for clave, path in CLEAN_FILES.items():
        print(f"  Leyendo {path.name} ...")
        df = pd.read_csv(path, sep=";", encoding="utf-8-sig", dtype=str, low_memory=False)

        if modo == "SEMANAL":
            df = df[(df["ano"] == str(anio)) & (df["semana"] == str(semana))]

        # Convertir columnas numéricas a tipo adecuado (manteniendo NaN como None)
        for col in ["ano", "semana", "sub_reg_nt", "diresa",
                    "episodios", "hospitalizados", "defunciones",
                    "casos_neumonia", "casos", "casos_no_neumonia", "edad"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")

        datos[clave] = df
        print(f"    -> {len(df):,} filas")

    return datos


# ---------------------------------------------------------------------------
# FASE A — POBLAR CATÁLOGOS (idempotente)
# ---------------------------------------------------------------------------

def poblar_catalogo_geo(cur, df_list: list) -> None:
    """
    Pobla departamento, provincia, distrito a partir de todos los DataFrames.
    Estrategia: derivar id_departamento (2 dígitos) e id_provincia (4 dígitos)
    del ubigeo de 6 dígitos, que ya viene limpio del script de limpieza.
    """
    print("  [Geo] Recopilando ubigeos únicos ...")

    # Unir todos los ubigeos de todos los datasets
    ubigeos_df = pd.concat([
        df[["ubigeo", "departamento", "provincia", "distrito"]]
        for df in df_list
        if all(c in df.columns for c in ["ubigeo", "departamento", "provincia", "distrito"])
    ]).drop_duplicates(subset=["ubigeo"]).dropna(subset=["ubigeo"])

    # Derivar IDs desde ubigeo
    ubigeos_df = ubigeos_df.copy()
    ubigeos_df["id_departamento"] = ubigeos_df["ubigeo"].str[:2]
    ubigeos_df["id_provincia"]    = ubigeos_df["ubigeo"].str[:4]

    # INSERT departamentos
    depts = ubigeos_df[["id_departamento", "departamento"]].drop_duplicates()
    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO departamento (id_departamento, nombre)
        VALUES (%s, %s)
        ON CONFLICT (id_departamento) DO NOTHING
        """,
        [(r["id_departamento"], r["departamento"]) for _, r in depts.iterrows()],
        page_size=BATCH_SIZE,
    )
    print(f"    -> {len(depts)} departamentos procesados.")

    # INSERT provincias
    provs = ubigeos_df[["id_provincia", "provincia", "id_departamento"]].drop_duplicates()
    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO provincia (id_provincia, nombre, id_departamento)
        VALUES (%s, %s, %s)
        ON CONFLICT (id_provincia) DO NOTHING
        """,
        [(r["id_provincia"], r["provincia"], r["id_departamento"]) for _, r in provs.iterrows()],
        page_size=BATCH_SIZE,
    )
    print(f"    -> {len(provs)} provincias procesadas.")

    # INSERT distritos
    distritos = ubigeos_df[["ubigeo", "distrito", "id_provincia"]].drop_duplicates()
    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO distrito (ubigeo, nombre, id_provincia)
        VALUES (%s, %s, %s)
        ON CONFLICT (ubigeo) DO NOTHING
        """,
        [(r["ubigeo"], r["distrito"], r["id_provincia"]) for _, r in distritos.iterrows()],
        page_size=BATCH_SIZE,
    )
    print(f"    -> {len(distritos)} distritos procesados.")


def poblar_periodos(cur, df_list: list) -> None:
    """Pobla periodo_epidemiologico con todos los pares (anio, semana) únicos."""
    print("  [Periodos] Recopilando periodos únicos ...")

    periodos = set()
    for df in df_list:
        if "ano" in df.columns and "semana" in df.columns:
            for _, row in df[["ano", "semana"]].drop_duplicates().iterrows():
                if pd.notna(row["ano"]) and pd.notna(row["semana"]):
                    periodos.add((int(row["ano"]), int(row["semana"])))

    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO periodo_epidemiologico (anio, semana)
        VALUES (%s, %s)
        ON CONFLICT (anio, semana) DO NOTHING
        """,
        list(periodos),
        page_size=BATCH_SIZE,
    )
    print(f"    -> {len(periodos)} periodos procesados.")


def poblar_direcciones_salud(cur, df_list: list) -> None:
    """
    Pobla direccion_salud con todos los códigos únicos de sub_reg_nt / diresa.
    Ambos son el mismo catálogo según el plan.
    """
    print("  [Diresa] Recopilando códigos únicos de dirección de salud ...")

    codigos = set()
    for df in df_list:
        for col in ["sub_reg_nt", "diresa"]:
            if col in df.columns:
                vals = df[col].dropna().astype(int).unique()
                codigos.update(int(v) for v in vals)

    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO direccion_salud (codigo_origen)
        VALUES (%s)
        ON CONFLICT (codigo_origen) DO NOTHING
        """,
        [(c,) for c in codigos],
        page_size=BATCH_SIZE,
    )
    print(f"    -> {len(codigos)} códigos de dirección de salud procesados.")


# ---------------------------------------------------------------------------
# HELPERS — resolver FKs en memoria (más eficiente que consultar por fila)
# ---------------------------------------------------------------------------

def cargar_mapa_periodos(cur) -> Dict[Tuple[int, int], int]:
    """Retorna {(anio, semana): id_periodo} para todos los periodos en BD."""
    cur.execute("SELECT id_periodo, anio, semana FROM periodo_epidemiologico")
    return {(r[1], r[2]): r[0] for r in cur.fetchall()}


def cargar_mapa_diresa(cur) -> Dict[int, int]:
    """Retorna {codigo_origen: id_diresa} para todas las direcciones en BD."""
    cur.execute("SELECT id_diresa, codigo_origen FROM direccion_salud")
    return {r[1]: r[0] for r in cur.fetchall()}


# ---------------------------------------------------------------------------
# FASE B — INSERTAR HECHOS
# ---------------------------------------------------------------------------

def insertar_eda(cur, df: pd.DataFrame,
                 map_periodo: Dict, map_diresa: Dict) -> Tuple[int, int]:
    """
    Inserta filas en caso_eda.
    Retorna (filas_insertadas, filas_omitidas).
    """
    print("  [EDA] Preparando inserción ...")
    batch   = []
    omitidas = 0

    for _, row in df.iterrows():
        key_periodo = (int(row["ano"]), int(row["semana"]))
        id_periodo  = map_periodo.get(key_periodo)
        if id_periodo is None:
            omitidas += 1
            continue

        cod_diresa = int(row["sub_reg_nt"]) if pd.notna(row.get("sub_reg_nt")) else None
        id_diresa  = map_diresa.get(cod_diresa) if cod_diresa is not None else None

        batch.append((
            row["ubigeo"],
            id_periodo,
            id_diresa,
            row["grupo_etario"],
            int(row["episodios"])      if pd.notna(row.get("episodios"))      else None,
            int(row["hospitalizados"]) if pd.notna(row.get("hospitalizados")) else None,
            int(row["defunciones"])    if pd.notna(row.get("defunciones"))    else None,
        ))

    if not batch:
        print("    -> Sin filas para insertar.")
        return 0, omitidas

    # Conteo antes de insertar para calcular realmente insertadas
    cur.execute("SELECT COUNT(*) FROM caso_eda")
    antes = cur.fetchone()[0]

    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO caso_eda
            (ubigeo, id_periodo, id_diresa, grupo_etario,
             episodios, hospitalizados, defunciones)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (ubigeo, id_periodo, grupo_etario) DO NOTHING
        """,
        batch,
        page_size=BATCH_SIZE,
    )

    cur.execute("SELECT COUNT(*) FROM caso_eda")
    despues = cur.fetchone()[0]
    insertadas = despues - antes
    omitidas  += len(batch) - insertadas

    print(f"    -> {insertadas:,} insertadas | {omitidas:,} omitidas (duplicados).")
    return insertadas, omitidas


def insertar_ira_neumonia(cur, df: pd.DataFrame,
                          map_periodo: Dict, map_diresa: Dict) -> Tuple[int, int]:
    """Inserta filas en caso_ira_neumonia."""
    print("  [IRA-Neumonía] Preparando inserción ...")
    batch    = []
    omitidas = 0

    for _, row in df.iterrows():
        key_periodo = (int(row["ano"]), int(row["semana"]))
        id_periodo  = map_periodo.get(key_periodo)
        if id_periodo is None:
            omitidas += 1
            continue

        cod_diresa = int(row["sub_reg_nt"]) if pd.notna(row.get("sub_reg_nt")) else None
        id_diresa  = map_diresa.get(cod_diresa) if cod_diresa is not None else None

        batch.append((
            row["ubigeo"],
            id_periodo,
            id_diresa,
            row["grupo_etario"],
            int(row["neumonia"])       if pd.notna(row.get("neumonia"))       else None,
            int(row["hospitalizados"]) if pd.notna(row.get("hospitalizados")) else None,
            int(row["defunciones"])    if pd.notna(row.get("defunciones"))    else None,
        ))

    if not batch:
        print("    -> Sin filas para insertar.")
        return 0, omitidas

    cur.execute("SELECT COUNT(*) FROM caso_ira_neumonia")
    antes = cur.fetchone()[0]

    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO caso_ira_neumonia
            (ubigeo, id_periodo, id_diresa, grupo_etario,
             casos_neumonia, hospitalizados, defunciones)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (ubigeo, id_periodo, grupo_etario) DO NOTHING
        """,
        batch,
        page_size=BATCH_SIZE,
    )

    cur.execute("SELECT COUNT(*) FROM caso_ira_neumonia")
    despues    = cur.fetchone()[0]
    insertadas = despues - antes
    omitidas  += len(batch) - insertadas

    print(f"    -> {insertadas:,} insertadas | {omitidas:,} omitidas.")
    return insertadas, omitidas


def insertar_ira_no_neumonia(cur, df: pd.DataFrame,
                             map_periodo: Dict, map_diresa: Dict) -> Tuple[int, int]:
    """Inserta filas en caso_ira_no_neumonia."""
    print("  [IRA-No Neumonía] Preparando inserción ...")
    batch    = []
    omitidas = 0

    for _, row in df.iterrows():
        key_periodo = (int(row["ano"]), int(row["semana"]))
        id_periodo  = map_periodo.get(key_periodo)
        if id_periodo is None:
            omitidas += 1
            continue

        cod_diresa = int(row["sub_reg_nt"]) if pd.notna(row.get("sub_reg_nt")) else None
        id_diresa  = map_diresa.get(cod_diresa) if cod_diresa is not None else None

        batch.append((
            row["ubigeo"],
            id_periodo,
            id_diresa,
            int(row["casos_no_neumonia"]) if pd.notna(row.get("casos_no_neumonia")) else None,
        ))

    if not batch:
        print("    -> Sin filas para insertar.")
        return 0, omitidas

    cur.execute("SELECT COUNT(*) FROM caso_ira_no_neumonia")
    antes = cur.fetchone()[0]

    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO caso_ira_no_neumonia
            (ubigeo, id_periodo, id_diresa, casos)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (ubigeo, id_periodo) DO NOTHING
        """,
        batch,
        page_size=BATCH_SIZE,
    )

    cur.execute("SELECT COUNT(*) FROM caso_ira_no_neumonia")
    despues    = cur.fetchone()[0]
    insertadas = despues - antes
    omitidas  += len(batch) - insertadas

    print(f"    -> {insertadas:,} insertadas | {omitidas:,} omitidas.")
    return insertadas, omitidas


def insertar_dengue(cur, df: pd.DataFrame,
                    map_periodo: Dict, map_diresa: Dict) -> Tuple[int, int]:
    """
    Inserta filas en caso_dengue.
    Dengue NO tiene UNIQUE constraint de negocio (un caso individual
    puede repetirse legítimamente — mismo ubigeo/semana/edad/sexo son
    dos personas distintas). Se usa ON CONFLICT DO NOTHING solo para
    la PK autogenerada (no aplica en la práctica, pero se mantiene
    el patrón para consistencia con el resto).
    """
    print("  [Dengue] Preparando inserción ...")
    batch    = []
    omitidas = 0

    for _, row in df.iterrows():
        key_periodo = (int(row["ano"]), int(row["semana"]))
        id_periodo  = map_periodo.get(key_periodo)
        if id_periodo is None:
            omitidas += 1
            continue

        cod_diresa = int(row["diresa"]) if pd.notna(row.get("diresa")) else None
        id_diresa  = map_diresa.get(cod_diresa) if cod_diresa is not None else None

        edad = int(row["edad"]) if pd.notna(row.get("edad")) else None

        batch.append((
            row["ubigeo"],
            id_periodo,
            id_diresa,
            str(row["enfermedad"]),
            str(row["diagnostic"]) if pd.notna(row.get("diagnostic")) else None,
            edad,
            str(row["tipo_edad"]),
            str(row["sexo"]),
        ))

    if not batch:
        print("    -> Sin filas para insertar.")
        return 0, omitidas

    cur.execute("SELECT COUNT(*) FROM caso_dengue")
    antes = cur.fetchone()[0]

    psycopg2.extras.execute_batch(
        cur,
        """
        INSERT INTO caso_dengue
            (ubigeo, id_periodo, id_diresa, enfermedad,
             diagnostic, edad, tipo_edad, sexo)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        batch,
        page_size=BATCH_SIZE,
    )

    cur.execute("SELECT COUNT(*) FROM caso_dengue")
    despues    = cur.fetchone()[0]
    insertadas = despues - antes
    omitidas  += len(batch) - insertadas

    print(f"    -> {insertadas:,} insertadas | {omitidas:,} omitidas.")
    return insertadas, omitidas


# ---------------------------------------------------------------------------
# FASE C — REGISTRAR EN control_carga
# ---------------------------------------------------------------------------

def registrar_carga(cur, dataset: str, modo: str,
                    anio: Optional[int], semana: Optional[int],
                    insertadas: int, omitidas: int,
                    estado: str, detalle_error: Optional[str] = None) -> None:
    cur.execute(
        """
        INSERT INTO control_carga
            (dataset, modo, anio, semana, fecha_ejecucion,
             filas_insertadas, filas_omitidas, estado, detalle_error)
        VALUES (%s, %s, %s, %s, now(), %s, %s, %s, %s)
        """,
        (dataset, modo, anio, semana, insertadas, omitidas, estado, detalle_error),
    )


# ---------------------------------------------------------------------------
# PUNTO DE ENTRADA
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Carga datasets MINSA limpios a PostgreSQL."
    )
    parser.add_argument(
        "--modo", choices=["HISTORICO", "SEMANAL"], required=True,
        help="HISTORICO: carga todo. SEMANAL: carga solo el anio/semana indicado."
    )
    parser.add_argument("--anio",  type=int, help="Año epidemiológico (requerido en modo SEMANAL).")
    parser.add_argument("--semana", type=int, help="Semana epidemiológica (requerido en modo SEMANAL).")
    args = parser.parse_args()

    if args.modo == "SEMANAL" and (args.anio is None or args.semana is None):
        print("ERROR — En modo SEMANAL debes indicar --anio y --semana.")
        sys.exit(1)

    print("\n" + "=" * 70)
    print("INICIO — Script de carga MINSA a PostgreSQL")
    print(f"  Modo: {args.modo}" + (f" | Año: {args.anio} | Semana: {args.semana}" if args.modo == "SEMANAL" else ""))
    print("=" * 70 + "\n")

    # --- Entorno y conexión ---
    print(">> Configuración")
    cargar_env()
    conn = obtener_conexion()
    cur  = conn.cursor()

    try:
        # --- Leer datos limpios ---
        print("\n>> Leyendo archivos limpios")
        datos = leer_limpios(args.modo, args.anio, args.semana)

        df_eda          = datos["eda"]
        df_ira_neu      = datos["ira_neumonia"]
        df_ira_no_neu   = datos["ira_no_neumonia"]
        df_dengue       = datos["dengue"]

        # ---------------------------------------------------------------
        # FASE A — Catálogos
        # ---------------------------------------------------------------
        print("\n>> Fase A — Catálogos")
        poblar_catalogo_geo(cur, [df_eda, df_ira_neu, df_ira_no_neu, df_dengue])
        poblar_periodos(cur,     [df_eda, df_ira_neu, df_ira_no_neu, df_dengue])
        poblar_direcciones_salud(cur, [df_eda, df_ira_neu, df_ira_no_neu, df_dengue])
        conn.commit()
        print("  Catálogos confirmados (COMMIT).")

        # Mapas en memoria para resolver FKs sin consultas por fila
        map_periodo = cargar_mapa_periodos(cur)
        map_diresa  = cargar_mapa_diresa(cur)

        # ---------------------------------------------------------------
        # FASE B — Hechos
        # ---------------------------------------------------------------
        print("\n>> Fase B — Hechos")

        ins_eda,    om_eda    = insertar_eda(cur, df_eda, map_periodo, map_diresa)
        ins_neu,    om_neu    = insertar_ira_neumonia(cur, df_ira_neu, map_periodo, map_diresa)
        ins_no_neu, om_no_neu = insertar_ira_no_neumonia(cur, df_ira_no_neu, map_periodo, map_diresa)
        ins_den,    om_den    = insertar_dengue(cur, df_dengue, map_periodo, map_diresa)

        conn.commit()
        print("  Hechos confirmados (COMMIT).")

        # ---------------------------------------------------------------
        # FASE C — Control de carga
        # ---------------------------------------------------------------
        print("\n>> Fase C — Registro de control")
        registrar_carga(cur, "EDA",           args.modo, args.anio, args.semana, ins_eda,    om_eda,    "COMPLETADO")
        registrar_carga(cur, "IRA_NEUMONIA",  args.modo, args.anio, args.semana, ins_neu,    om_neu,    "COMPLETADO")
        registrar_carga(cur, "IRA_NO_NEUMONIA", args.modo, args.anio, args.semana, ins_no_neu, om_no_neu, "COMPLETADO")
        registrar_carga(cur, "DENGUE",        args.modo, args.anio, args.semana, ins_den,    om_den,    "COMPLETADO")
        conn.commit()

        # ---------------------------------------------------------------
        # Resumen final
        # ---------------------------------------------------------------
        print("\n" + "=" * 70)
        print("RESUMEN FINAL DE CARGA")
        print("=" * 70)
        print(f"  {'Dataset':<20} {'Insertadas':>12} {'Omitidas':>10}")
        print(f"  {'-'*20} {'-'*12} {'-'*10}")
        print(f"  {'EDA':<20} {ins_eda:>12,} {om_eda:>10,}")
        print(f"  {'IRA Neumonía':<20} {ins_neu:>12,} {om_neu:>10,}")
        print(f"  {'IRA No Neumonía':<20} {ins_no_neu:>12,} {om_no_neu:>10,}")
        print(f"  {'Dengue':<20} {ins_den:>12,} {om_den:>10,}")
        total_ins = ins_eda + ins_neu + ins_no_neu + ins_den
        total_om  = om_eda  + om_neu  + om_no_neu  + om_den
        print(f"  {'TOTAL':<20} {total_ins:>12,} {total_om:>10,}")
        print("\nOK Carga completada exitosamente.\n")

    except Exception as e:
        conn.rollback()
        # Intentar registrar el fallo si la conexión sigue activa
        try:
            registrar_carga(cur, "EDA", args.modo, args.anio, args.semana,
                            0, 0, "FALLIDO", str(e))
            conn.commit()
        except Exception:
            pass
        print(f"\nERROR — La carga falló y se hizo ROLLBACK: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
