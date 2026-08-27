"""
limpiar_datasets_minsa.py
=========================
Script de limpieza y preparación de los 3 datasets del MINSA:
  - EDA  (Enfermedades Diarreicas Agudas)  — dato ya agregado distrito/semana
  - IRA  (Infecciones Respiratorias Agudas) — dato ya agregado distrito/semana
  - Dengue                                  — caso individual, sin agregación

Salida
------
  - Estructuras de datos limpias en memoria (DataFrames de pandas) que pueden
    encadenarse con el script de carga a base de datos.
  - Archivos CSV de filas rechazadas por dataset en OUTPUT_DIR.
  - Archivo de reporte de resumen en OUTPUT_DIR.

Frontera explícita
------------------
  Este script NO crea tablas, NO hace INSERT, NO resuelve claves foraneas,
  NO integra Open-Meteo y NO agrega Dengue a nivel semana/distrito.
  Todo eso pertenece al plan de creacion de base de datos.

Uso
---
  python limpiar_datasets_minsa.py [--no-dedup]

  --no-dedup   Detecta duplicados pero NO los elimina (los deja en los datos limpios).
               Por defecto, los duplicados se eliminan automaticamente.

Requisitos
----------
  pip install pandas
"""

import argparse
import datetime
import os
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

# ---------------------------------------------------------------------------
# CONFIGURACION — ajustar rutas si es necesario
# ---------------------------------------------------------------------------

DOWNLOADS_DIR = Path.home() / "Downloads"

INPUT_FILES = {
    "EDA":    DOWNLOADS_DIR / "datos_abiertos_vigilancia_edas_2000_2024.csv",
    "IRA":    DOWNLOADS_DIR / "datos_abiertos_vigilancia_iras_2000_2024.csv",
    "Dengue": DOWNLOADS_DIR / "datos_abiertos_vigilancia_dengue_2000_2024.csv",
}

# Los archivos EDA e IRA no traen fila de encabezado; Dengue si.
HAS_HEADER = {
    "EDA":    False,
    "IRA":    False,
    "Dengue": True,
}

# Separador real detectado en los archivos
CSV_SEPARATOR = ";"

# Directorio donde se escriben los rechazados y el reporte
OUTPUT_DIR = DOWNLOADS_DIR / "minsa_limpieza_output"

# Anio maximo razonable para validacion
ANO_MAX = datetime.datetime.now().year
ANO_MIN = 1990

# Limite de edad para Dengue (deteccion de errores evidentes de captura)
EDAD_MAX_SANIDAD = 120

# ---------------------------------------------------------------------------
# NOMBRES INTERNOS DE COLUMNAS POR DATASET
# (orden de posicion para EDA e IRA que no traen encabezado)
# ---------------------------------------------------------------------------

# EDA: 13 columnas, sin encabezado → se asignan por posicion
EDA_COL_NAMES = [
    "departamento", "provincia", "distrito",
    "ano", "semana", "sub_reg_nt", "ubigeo",
    "episodios_men5", "hospitalizados_men5", "defunciones_men5",
    "episodios_may5", "hospitalizados_may5", "defunciones_may5",
]

# IRA: 14 columnas, sin encabezado → se asignan por posicion
IRA_COL_NAMES = [
    "departamento", "provincia", "distrito",
    "ano", "semana", "sub_reg_nt", "ubigeo",
    "neumonia_men5", "hospitalizados_men5", "defunciones_men5",
    "neumonia_may60", "hospitalizados_may60", "defunciones_may60",
    "casos_no_neumonia",
]

# Dengue: 14 columnas CON encabezado → mapeo desde nombres crudos a internos
# Columnas activas (localidad y localcod se descartan explicitamente)
DENGUE_COL_RENAME = {
    "departamento": "departamento",
    "provincia":    "provincia",
    "distrito":     "distrito",
    "enfermedad":   "enfermedad",
    "ano":          "ano",
    "semana":       "semana",
    "diagnostic":   "diagnostic",
    "diresa":       "diresa",
    "ubigeo":       "ubigeo",
    "edad":         "edad",
    "tipo_edad":    "tipo_edad",
    "sexo":         "sexo",
}
DENGUE_COLS_DISCARD = {"localidad", "localcod"}
DENGUE_ACTIVE_COLS  = list(DENGUE_COL_RENAME.values())

# ---------------------------------------------------------------------------
# DOMINIOS DE VALIDACION CERRADOS
# ---------------------------------------------------------------------------

TIPO_EDAD_VALIDOS = {"A", "M", "D"}
SEXO_VALIDOS      = {"M", "F"}

# ---------------------------------------------------------------------------
# UTILIDADES
# ---------------------------------------------------------------------------

def normalizar_texto(s: str) -> str:
    """Quita tildes, pasa a minusculas y hace strip."""
    nfkd = unicodedata.normalize("NFKD", s)
    sin_tildes = "".join(c for c in nfkd if not unicodedata.combining(c))
    return sin_tildes.strip().lower()


def limpiar_ubigeo(raw: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Normaliza ubigeo a string de 6 digitos.
    Retorna (ubigeo_limpio, motivo_rechazo).
    motivo_rechazo es None si el valor es valido.
    """
    val = str(raw).strip()
    if not val or val.upper() in ("NA", "N/A", "S/D", ""):
        return None, "ubigeo: valor ausente"
    if not val.isdigit():
        return None, f"ubigeo: contiene caracteres no numericos ({val!r})"
    if len(val) == 5:
        val = val.zfill(6)
    if len(val) != 6:
        return None, f"ubigeo: longitud invalida {len(val)} (esperado 6) ({val!r})"
    return val, None


def limpiar_entero(raw: Any, nombre: str,
                   rango_min: Optional[int] = None,
                   rango_max: Optional[int] = None) -> Tuple[Optional[int], Optional[str]]:
    """
    Convierte a entero con validacion de rango.
    Retorna (valor, motivo_rechazo).
    """
    val = str(raw).strip() if raw is not None else ""
    if not val or val.upper() in ("NA", "N/A", "S/D"):
        return None, f"{nombre}: valor ausente"
    if not re.fullmatch(r"-?\d+", val):
        return None, f"{nombre}: no es entero ({val!r})"
    n = int(val)
    if rango_min is not None and n < rango_min:
        return None, f"{nombre}: fuera de rango ({n} < {rango_min})"
    if rango_max is not None and n > rango_max:
        return None, f"{nombre}: fuera de rango ({n} > {rango_max})"
    return n, None


def limpiar_conteo(raw: Any, nombre: str) -> Tuple[Optional[int], Optional[str], bool]:
    """
    Limpia un campo numerico de conteo (episodios, hospitalizados, defunciones, etc.).
    - Vacio / NA / N/A / s/d → None  (ausencia legitima, NO rechazo)
    - Negativo               → rechazo
    - "0" explicito          → 0
    Retorna (valor, motivo_rechazo, es_ausente_legitimo).
    """
    if raw is None:
        return None, None, True
    val = str(raw).strip()
    if not val or val.upper() in ("NA", "N/A", "S/D", "S", "D", ""):
        return None, None, True
    if not re.fullmatch(r"-?\d+", val):
        return None, f"{nombre}: valor no numerico ({val!r})", False
    n = int(val)
    if n < 0:
        return None, f"{nombre}: valor negativo ({n})", False
    return n, None, False


def limpiar_texto_geo(raw: str) -> str:
    """Strip y title-case para campos geograficos de texto."""
    return str(raw).strip().title()


# ---------------------------------------------------------------------------
# LECTURA DE ARCHIVOS
# ---------------------------------------------------------------------------

def leer_csv(path: Path, col_names: Optional[List[str]], has_header: bool,
             chunk_size: int = 200_000) -> pd.DataFrame:
    """
    Lee un CSV semicolon-separated con BOM UTF-8.
    Si has_header=False, asigna col_names por posicion.
    Retorna DataFrame con todos los valores como str (object).
    """
    print(f"  Leyendo {path.name} ...")

    kwargs: Dict[str, Any] = {
        "sep":          CSV_SEPARATOR,
        "encoding":     "utf-8-sig",
        "dtype":        str,
        "low_memory":   False,
        "on_bad_lines": "warn",
    }

    if has_header:
        kwargs["header"] = 0
    else:
        kwargs["header"] = None
        if col_names:
            kwargs["names"] = col_names

    chunks = []
    for chunk in pd.read_csv(path, chunksize=chunk_size, **kwargs):
        chunks.append(chunk)

    df = pd.concat(chunks, ignore_index=True)
    print(f"  -> {len(df):,} filas leidas.")
    return df


# ---------------------------------------------------------------------------
# VALIDACIONES DE ENTRADA (Fase 0 — antes de procesar cualquier fila)
# ---------------------------------------------------------------------------

def validar_archivos_existen() -> None:
    """Verifica que los 3 archivos fuente existen y son legibles."""
    errores = []
    for nombre, path in INPUT_FILES.items():
        if not path.exists():
            errores.append(f"  x [{nombre}] No encontrado: {path}")
        elif not os.access(path, os.R_OK):
            errores.append(f"  x [{nombre}] Sin permiso de lectura: {path}")
    if errores:
        print("ERROR — archivos de entrada faltantes o inaccesibles:")
        for e in errores:
            print(e)
        sys.exit(1)
    print("OK Los 3 archivos fuente existen y son legibles.")


def validar_columnas_dengue(df: pd.DataFrame) -> None:
    """
    Valida columnas del dataset Dengue (el unico con encabezado).
    - Falta columna esperada → detener.
    - Columna nueva no mapeada (aparte de las descartadas) → detener.
    """
    cols_presentes = set(df.columns.str.strip().str.lower())
    cols_esperadas_raw = set(DENGUE_COL_RENAME.keys())
    cols_total_conocidas = cols_esperadas_raw | DENGUE_COLS_DISCARD

    faltantes = cols_esperadas_raw - cols_presentes
    nuevas    = cols_presentes - cols_total_conocidas

    errores = []
    if faltantes:
        errores.append(f"  x Columnas esperadas FALTANTES en Dengue: {sorted(faltantes)}")
    if nuevas:
        errores.append(f"  x Columnas NUEVAS NO MAPEADAS en Dengue: {sorted(nuevas)}")

    if errores:
        print("ERROR — validacion de columnas Dengue:")
        for e in errores:
            print(e)
        sys.exit(1)
    print("  OK Columnas Dengue validadas.")


def validar_columnas_posicionales(df: pd.DataFrame, nombres_esperados: List[str],
                                  dataset: str) -> None:
    """
    Para EDA e IRA (sin encabezado) valida que el numero de columnas coincida.
    """
    if len(df.columns) != len(nombres_esperados):
        print(
            f"ERROR — [{dataset}] numero de columnas inesperado: "
            f"encontradas={len(df.columns)}, esperadas={len(nombres_esperados)}"
        )
        sys.exit(1)
    print(f"  OK Columnas {dataset} validadas ({len(nombres_esperados)} columnas por posicion).")


# ---------------------------------------------------------------------------
# LIMPIEZA EDA
# ---------------------------------------------------------------------------

def limpiar_eda(df_raw: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame, Dict]:
    """
    Limpia el dataset EDA y genera:
      - df_limpio: filas validas ya en formato largo (2 filas por fila original).
      - df_rechazados: filas invalidas con motivo.
      - stats: diccionario con contadores de resumen.
    """
    print("  Limpiando EDA ...")

    cols_conteo_men5 = ["episodios_men5", "hospitalizados_men5", "defunciones_men5"]
    cols_conteo_may5 = ["episodios_may5", "hospitalizados_may5", "defunciones_may5"]
    cols_conteo_todas = cols_conteo_men5 + cols_conteo_may5

    filas_limpias = []
    rechazados    = []
    nulos_por_ausencia = 0
    total_leidas   = len(df_raw)

    for idx, row in df_raw.iterrows():
        motivos = []

        # --- Geografia ---
        departamento = limpiar_texto_geo(row["departamento"])
        provincia    = limpiar_texto_geo(row["provincia"])
        distrito     = limpiar_texto_geo(row["distrito"])

        # --- ubigeo ---
        ubigeo, m = limpiar_ubigeo(row["ubigeo"])
        if m:
            motivos.append(m)

        # --- sub_reg_nt ---
        sub_reg_raw = str(row["sub_reg_nt"]).strip()
        if not sub_reg_raw or not sub_reg_raw.isdigit():
            motivos.append(f"sub_reg_nt: valor invalido ({sub_reg_raw!r})")
            sub_reg_nt = None
        else:
            sub_reg_nt = int(sub_reg_raw)

        # --- ano ---
        ano, m = limpiar_entero(row["ano"], "ano", ANO_MIN, ANO_MAX)
        if m:
            motivos.append(m)

        # --- semana ---
        semana, m = limpiar_entero(row["semana"], "semana", 1, 53)
        if m:
            motivos.append(m)

        # --- campos de conteo ---
        conteo_vals = {}
        for col in cols_conteo_todas:
            val, motivo_c, es_ausente = limpiar_conteo(row[col], col)
            if motivo_c:
                motivos.append(motivo_c)
            if es_ausente:
                nulos_por_ausencia += 1
            conteo_vals[col] = val

        if motivos:
            rechazados.append({
                "dataset":    "EDA",
                "fila_origen": idx + 1,
                "motivos":    " | ".join(motivos),
                "fila_raw":   ";".join(str(v) for v in row.values),
            })
            continue

        # --- unpivot: 2 filas candidatas ---
        fila_base = {
            "departamento": departamento,
            "provincia":    provincia,
            "distrito":     distrito,
            "ubigeo":       ubigeo,
            "sub_reg_nt":   sub_reg_nt,
            "ano":          ano,
            "semana":       semana,
        }

        fila_men5 = {**fila_base, "grupo_etario": "<5",
                     "episodios":      conteo_vals["episodios_men5"],
                     "hospitalizados": conteo_vals["hospitalizados_men5"],
                     "defunciones":    conteo_vals["defunciones_men5"]}

        fila_may5 = {**fila_base, "grupo_etario": ">=5",
                     "episodios":      conteo_vals["episodios_may5"],
                     "hospitalizados": conteo_vals["hospitalizados_may5"],
                     "defunciones":    conteo_vals["defunciones_may5"]}

        filas_limpias.append(fila_men5)
        filas_limpias.append(fila_may5)

    df_limpio     = pd.DataFrame(filas_limpias)
    df_rechazados = pd.DataFrame(rechazados)

    stats = {
        "filas_leidas":       total_leidas,
        "filas_limpias_src":  len(df_limpio) // 2,
        "filas_limpias_long": len(df_limpio),
        "filas_rechazadas":   len(df_rechazados),
        "nulos_por_ausencia": nulos_por_ausencia,
    }
    return df_limpio, df_rechazados, stats


# ---------------------------------------------------------------------------
# LIMPIEZA IRA
# ---------------------------------------------------------------------------

def limpiar_ira(df_raw: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, Dict]:
    """
    Limpia el dataset IRA y genera:
      - df_neumonia: filas de neumonia en formato largo (2 filas por fila fuente valida).
      - df_no_neumonia: filas de IRA no neumonia (1 fila por fila fuente valida).
      - df_rechazados: filas invalidas con motivo.
      - stats: diccionario con contadores de resumen.
    """
    print("  Limpiando IRA ...")

    cols_neumonia_men5  = ["neumonia_men5", "hospitalizados_men5", "defunciones_men5"]
    cols_neumonia_may60 = ["neumonia_may60", "hospitalizados_may60", "defunciones_may60"]
    cols_conteo_todas   = cols_neumonia_men5 + cols_neumonia_may60 + ["casos_no_neumonia"]

    filas_neumonia    = []
    filas_no_neumonia = []
    rechazados        = []
    nulos_por_ausencia = 0
    total_leidas = len(df_raw)

    for idx, row in df_raw.iterrows():
        motivos = []

        # --- Geografia ---
        departamento = limpiar_texto_geo(row["departamento"])
        provincia    = limpiar_texto_geo(row["provincia"])
        distrito     = limpiar_texto_geo(row["distrito"])

        # --- ubigeo ---
        ubigeo, m = limpiar_ubigeo(row["ubigeo"])
        if m:
            motivos.append(m)

        # --- sub_reg_nt ---
        sub_reg_raw = str(row["sub_reg_nt"]).strip()
        if not sub_reg_raw or not sub_reg_raw.isdigit():
            motivos.append(f"sub_reg_nt: valor invalido ({sub_reg_raw!r})")
            sub_reg_nt = None
        else:
            sub_reg_nt = int(sub_reg_raw)

        # --- ano ---
        ano, m = limpiar_entero(row["ano"], "ano", ANO_MIN, ANO_MAX)
        if m:
            motivos.append(m)

        # --- semana ---
        semana, m = limpiar_entero(row["semana"], "semana", 1, 53)
        if m:
            motivos.append(m)

        # --- campos de conteo ---
        conteo_vals = {}
        for col in cols_conteo_todas:
            val, motivo_c, es_ausente = limpiar_conteo(row[col], col)
            if motivo_c:
                motivos.append(motivo_c)
            if es_ausente:
                nulos_por_ausencia += 1
            conteo_vals[col] = val

        if motivos:
            rechazados.append({
                "dataset":    "IRA",
                "fila_origen": idx + 1,
                "motivos":    " | ".join(motivos),
                "fila_raw":   ";".join(str(v) for v in row.values),
            })
            continue

        fila_base = {
            "departamento": departamento,
            "provincia":    provincia,
            "distrito":     distrito,
            "ubigeo":       ubigeo,
            "sub_reg_nt":   sub_reg_nt,
            "ano":          ano,
            "semana":       semana,
        }

        # Neumonia: 2 filas candidatas (<5 y >60)
        fila_men5 = {**fila_base, "grupo_etario": "<5",
                     "neumonia":       conteo_vals["neumonia_men5"],
                     "hospitalizados": conteo_vals["hospitalizados_men5"],
                     "defunciones":    conteo_vals["defunciones_men5"]}

        fila_may60 = {**fila_base, "grupo_etario": ">60",
                      "neumonia":       conteo_vals["neumonia_may60"],
                      "hospitalizados": conteo_vals["hospitalizados_may60"],
                      "defunciones":    conteo_vals["defunciones_may60"]}

        filas_neumonia.append(fila_men5)
        filas_neumonia.append(fila_may60)

        # No neumonia: 1 fila candidata (siempre <5, no se asigna grupo_etario)
        fila_no_neu = {**fila_base, "casos_no_neumonia": conteo_vals["casos_no_neumonia"]}
        filas_no_neumonia.append(fila_no_neu)

    df_neumonia    = pd.DataFrame(filas_neumonia)
    df_no_neumonia = pd.DataFrame(filas_no_neumonia)
    df_rechazados  = pd.DataFrame(rechazados)

    stats = {
        "filas_leidas":         total_leidas,
        "filas_limpias_src":    len(filas_no_neumonia),
        "filas_neumonia_long":  len(df_neumonia),
        "filas_no_neumonia":    len(df_no_neumonia),
        "filas_rechazadas":     len(df_rechazados),
        "nulos_por_ausencia":   nulos_por_ausencia,
    }
    return df_neumonia, df_no_neumonia, df_rechazados, stats


# ---------------------------------------------------------------------------
# LIMPIEZA DENGUE
# ---------------------------------------------------------------------------

def limpiar_dengue(df_raw: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame, Dict]:
    """
    Limpia el dataset Dengue y genera:
      - df_limpio: filas validas, 1 fila por caso individual.
      - df_rechazados: filas invalidas con motivo.
      - stats: diccionario con contadores de resumen.

    Si tipo_edad o sexo tienen valores fuera de dominio el script
    DETIENE el procesamiento y reporta explicitamente (no descarta en silencio).
    """
    print("  Limpiando Dengue ...")

    # Renombrar columnas y descartar las no activas
    df = df_raw.copy()
    df.columns = [c.strip() for c in df.columns]
    cols_a_descartar = [c for c in df.columns if c in DENGUE_COLS_DISCARD]
    df.drop(columns=cols_a_descartar, inplace=True)
    df.rename(columns=DENGUE_COL_RENAME, inplace=True)

    filas_limpias = []
    rechazados    = []
    valores_enfermedad = set()
    total_leidas = len(df)

    # -----------------------------------------------------------------------
    # Pre-scan: tipo_edad y sexo
    # Si aparecen valores fuera de dominio, detener antes de iterar fila a fila.
    # -----------------------------------------------------------------------
    tipo_edad_unicos = set(df["tipo_edad"].dropna().str.strip().str.upper().unique())
    sexo_unicos      = set(df["sexo"].dropna().str.strip().str.upper().unique())

    tipo_edad_invalidos = tipo_edad_unicos - TIPO_EDAD_VALIDOS
    sexo_invalidos      = sexo_unicos - SEXO_VALIDOS

    if tipo_edad_invalidos:
        print(
            f"\nERROR CRITICO — Dengue: valores de tipo_edad fuera de dominio "
            f"{{A, M, D}}: {sorted(tipo_edad_invalidos)}\n"
            "El script se detiene. Revisar el archivo fuente antes de continuar."
        )
        sys.exit(1)

    if sexo_invalidos:
        print(
            f"\nERROR CRITICO — Dengue: valores de sexo fuera de dominio "
            f"{{M, F}}: {sorted(sexo_invalidos)}\n"
            "El script se detiene. Revisar el archivo fuente antes de continuar."
        )
        sys.exit(1)

    print("  OK tipo_edad y sexo dentro de dominio.")

    for idx, row in df.iterrows():
        motivos = []

        # --- Geografia ---
        departamento = limpiar_texto_geo(row["departamento"])
        provincia    = limpiar_texto_geo(row["provincia"])
        distrito     = limpiar_texto_geo(row["distrito"])

        # --- enfermedad: trim + mayusculas, sin restriccion de dominio ---
        enfermedad = str(row["enfermedad"]).strip().upper()
        valores_enfermedad.add(enfermedad)

        # --- diagnostic: trim solamente ---
        diagnostic = str(row["diagnostic"]).strip()

        # --- ubigeo ---
        ubigeo, m = limpiar_ubigeo(row["ubigeo"])
        if m:
            motivos.append(m)

        # --- diresa ---
        diresa_raw = str(row["diresa"]).strip()
        if not diresa_raw or diresa_raw.upper() in ("NA", "N/A", "S/D"):
            motivos.append("diresa: valor ausente")
            diresa = None
        elif not diresa_raw.isdigit():
            motivos.append(f"diresa: valor no numerico ({diresa_raw!r})")
            diresa = None
        else:
            diresa = int(diresa_raw)

        # --- ano ---
        ano, m = limpiar_entero(row["ano"], "ano", ANO_MIN, ANO_MAX)
        if m:
            motivos.append(m)

        # --- semana ---
        semana, m = limpiar_entero(row["semana"], "semana", 1, 53)
        if m:
            motivos.append(m)

        # --- edad ---
        edad_raw = str(row["edad"]).strip() if row["edad"] is not None else ""
        if not edad_raw or edad_raw.upper() in ("NA", "N/A", "S/D"):
            edad = None
            # edad ausente: no es motivo de rechazo, solo ausencia
        elif not re.fullmatch(r"\d+", edad_raw):
            motivos.append(f"edad: valor no numerico ({edad_raw!r})")
            edad = None
        else:
            edad = int(edad_raw)
            if edad < 0:
                motivos.append(f"edad: negativa ({edad})")
                edad = None
            elif edad > EDAD_MAX_SANIDAD:
                motivos.append(f"edad: supera limite de sanidad ({edad} > {EDAD_MAX_SANIDAD})")
                edad = None

        # --- tipo_edad (ya validado globalmente) ---
        tipo_edad = str(row["tipo_edad"]).strip().upper()

        # --- sexo (ya validado globalmente) ---
        sexo = str(row["sexo"]).strip().upper()

        if motivos:
            rechazados.append({
                "dataset":    "Dengue",
                "fila_origen": idx + 2,  # +2: 1 por encabezado, 1 por indexacion 1-based
                "motivos":    " | ".join(motivos),
                "fila_raw":   ";".join(str(v) for v in row.values),
            })
            continue

        filas_limpias.append({
            "departamento": departamento,
            "provincia":    provincia,
            "distrito":     distrito,
            "enfermedad":   enfermedad,
            "ano":          ano,
            "semana":       semana,
            "diagnostic":   diagnostic,
            "diresa":       diresa,
            "ubigeo":       ubigeo,
            "edad":         edad,
            "tipo_edad":    tipo_edad,
            "sexo":         sexo,
        })

    df_limpio     = pd.DataFrame(filas_limpias)
    df_rechazados = pd.DataFrame(rechazados)

    stats = {
        "filas_leidas":              total_leidas,
        "filas_limpias":             len(df_limpio),
        "filas_rechazadas":          len(df_rechazados),
        "count_enfermedad":          len(valores_enfermedad),
        "valores_enfermedad_unicos": sorted(valores_enfermedad),
    }
    return df_limpio, df_rechazados, stats


# ---------------------------------------------------------------------------
# DETECCION Y ELIMINACION DE DUPLICADOS
# ---------------------------------------------------------------------------

def gestionar_duplicados(df: pd.DataFrame, nombre: str,
                          deduplicar: bool) -> Tuple[pd.DataFrame, int]:
    """
    Detecta filas completamente identicas.
    Si deduplicar=True las elimina; si no, solo reporta.
    Retorna (df_resultado, n_duplicados).
    """
    n_dup = df.duplicated().sum()
    if n_dup > 0:
        if deduplicar:
            df = df.drop_duplicates().reset_index(drop=True)
            print(f"  [{nombre}] {n_dup:,} duplicados eliminados.")
        else:
            print(f"  [{nombre}] {n_dup:,} duplicados detectados (conservados por --no-dedup).")
    else:
        print(f"  [{nombre}] Sin duplicados.")
    return df, int(n_dup)


# ---------------------------------------------------------------------------
# ESCRITURA DE SALIDAS
# ---------------------------------------------------------------------------

def guardar_rechazados(df: pd.DataFrame, nombre_dataset: str) -> None:
    if df.empty:
        print(f"  [{nombre_dataset}] Sin filas rechazadas.")
        return
    path = OUTPUT_DIR / f"rechazados_{nombre_dataset.lower()}.csv"
    df.to_csv(path, index=False, encoding="utf-8-sig")
    print(f"  [{nombre_dataset}] {len(df):,} rechazados -> {path.name}")


def guardar_limpios(datos: Dict[str, pd.DataFrame]) -> None:
    """
    Escribe los 4 DataFrames limpios a CSV en OUTPUT_DIR.
    Los archivos originales de Descargas NO se modifican.
    Separador: ; (mismo que el original) para consistencia.
    Encoding: utf-8-sig para compatibilidad con Excel.
    """
    nombres = {
        "eda":             "limpio_eda.csv",
        "ira_neumonia":    "limpio_ira_neumonia.csv",
        "ira_no_neumonia": "limpio_ira_no_neumonia.csv",
        "dengue":          "limpio_dengue.csv",
    }
    print("\nGuardando datasets limpios ...")
    for clave, nombre_archivo in nombres.items():
        df = datos[clave]
        if df.empty:
            print(f"  [{clave}] DataFrame vacio, no se escribe archivo.")
            continue
        path = OUTPUT_DIR / nombre_archivo
        df.to_csv(path, index=False, sep=";", encoding="utf-8-sig")
        print(f"  [{clave}] {len(df):,} filas -> {nombre_archivo}  ({path.stat().st_size / 1_048_576:.1f} MB)")


def guardar_reporte(reporte: Dict) -> None:
    path = OUTPUT_DIR / "reporte_limpieza.txt"
    lineas = ["=" * 70, "REPORTE DE LIMPIEZA — DATASETS MINSA", "=" * 70, ""]

    for dataset, stats in reporte.items():
        lineas.append(f"[ {dataset} ]")
        for k, v in stats.items():
            if k == "valores_enfermedad_unicos":
                lineas.append(f"  {k}:")
                for e in v:
                    lineas.append(f"    - {e}")
            else:
                lineas.append(f"  {k}: {v}")
        lineas.append("")

    lineas += [
        "=" * 70,
        f"Generado: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "=" * 70,
    ]

    path.write_text("\n".join(lineas), encoding="utf-8")
    print(f"\nReporte escrito en: {path}")


# ---------------------------------------------------------------------------
# PUNTO DE ENTRADA
# ---------------------------------------------------------------------------

def main() -> Dict[str, pd.DataFrame]:
    """
    Ejecuta el pipeline completo de limpieza.
    Retorna un diccionario con las estructuras de datos limpias:
      {
        "eda":             DataFrame (formato largo con grupo_etario),
        "ira_neumonia":    DataFrame (formato largo con grupo_etario),
        "ira_no_neumonia": DataFrame (sin grupo_etario, siempre <5),
        "dengue":          DataFrame (caso por caso, sin agregacion),
      }
    Estas estructuras pueden encadenarse con el script de carga a base de datos.
    """
    parser = argparse.ArgumentParser(
        description="Limpieza de datasets MINSA: EDA, IRA, Dengue."
    )
    parser.add_argument(
        "--no-dedup", action="store_true",
        help="Detectar pero NO eliminar duplicados automaticamente."
    )
    args = parser.parse_args()
    deduplicar = not args.no_dedup

    print("\n" + "=" * 70)
    print("INICIO — Script de limpieza MINSA (EDA / IRA / Dengue)")
    print("=" * 70 + "\n")

    # -----------------------------------------------------------------------
    # Fase 0 — Validaciones de entrada
    # -----------------------------------------------------------------------
    print(">> Fase 0 — Validaciones de entrada")
    validar_archivos_existen()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"  Directorio de salida: {OUTPUT_DIR}\n")

    reporte_global: Dict[str, Any] = {}

    # -----------------------------------------------------------------------
    # EDA
    # -----------------------------------------------------------------------
    print(">> EDA")
    df_eda_raw = leer_csv(INPUT_FILES["EDA"], EDA_COL_NAMES, HAS_HEADER["EDA"])
    validar_columnas_posicionales(df_eda_raw, EDA_COL_NAMES, "EDA")

    df_eda, df_eda_rechazados, stats_eda = limpiar_eda(df_eda_raw)
    del df_eda_raw  # liberar memoria

    df_eda, n_dup_eda = gestionar_duplicados(df_eda, "EDA", deduplicar)
    guardar_rechazados(df_eda_rechazados, "EDA")

    stats_eda["duplicados_detectados"] = n_dup_eda
    reporte_global["EDA"] = stats_eda
    print(
        f"  EDA limpio: {stats_eda['filas_limpias_long']:,} filas (formato largo, "
        f"{stats_eda['filas_limpias_src']:,} filas fuente x 2 grupos etarios)\n"
    )

    # -----------------------------------------------------------------------
    # IRA
    # -----------------------------------------------------------------------
    print(">> IRA")
    df_ira_raw = leer_csv(INPUT_FILES["IRA"], IRA_COL_NAMES, HAS_HEADER["IRA"])
    validar_columnas_posicionales(df_ira_raw, IRA_COL_NAMES, "IRA")

    df_ira_neumonia, df_ira_no_neumonia, df_ira_rechazados, stats_ira = limpiar_ira(df_ira_raw)
    del df_ira_raw

    df_ira_neumonia,    n_dup_neu    = gestionar_duplicados(df_ira_neumonia,    "IRA-Neumonia",   deduplicar)
    df_ira_no_neumonia, n_dup_no_neu = gestionar_duplicados(df_ira_no_neumonia, "IRA-NoNeumonía", deduplicar)
    guardar_rechazados(df_ira_rechazados, "IRA")

    stats_ira["duplicados_neumonia"]    = n_dup_neu
    stats_ira["duplicados_no_neumonia"] = n_dup_no_neu
    reporte_global["IRA"] = stats_ira
    print(
        f"  IRA neumonia: {stats_ira['filas_neumonia_long']:,} filas | "
        f"IRA no neumonia: {stats_ira['filas_no_neumonia']:,} filas\n"
    )

    # -----------------------------------------------------------------------
    # Dengue
    # -----------------------------------------------------------------------
    print(">> Dengue")
    df_dengue_raw = leer_csv(INPUT_FILES["Dengue"], None, HAS_HEADER["Dengue"])
    validar_columnas_dengue(df_dengue_raw)

    df_dengue, df_dengue_rechazados, stats_dengue = limpiar_dengue(df_dengue_raw)
    del df_dengue_raw

    df_dengue, n_dup_dengue = gestionar_duplicados(df_dengue, "Dengue", deduplicar)
    guardar_rechazados(df_dengue_rechazados, "Dengue")

    stats_dengue["duplicados_detectados"] = n_dup_dengue
    reporte_global["Dengue"] = stats_dengue
    print(f"  Dengue limpio: {stats_dengue['filas_limpias']:,} casos individuales\n")

    # -----------------------------------------------------------------------
    # Guardar datasets limpios a disco y reporte final
    # -----------------------------------------------------------------------
    datos_limpios_dict = {
        "eda":             df_eda,
        "ira_neumonia":    df_ira_neumonia,
        "ira_no_neumonia": df_ira_no_neumonia,
        "dengue":          df_dengue,
    }
    guardar_limpios(datos_limpios_dict)
    guardar_reporte(reporte_global)

    print("\n" + "=" * 70)
    print("RESUMEN FINAL")
    print("=" * 70)
    for ds, s in reporte_global.items():
        leidas     = s.get("filas_leidas", 0)
        rechazadas = s.get("filas_rechazadas", 0)
        if ds == "EDA":
            limpias = s.get("filas_limpias_long", 0)
        elif ds == "IRA":
            limpias = s.get("filas_neumonia_long", 0) + s.get("filas_no_neumonia", 0)
        else:
            limpias = s.get("filas_limpias", 0)
        print(
            f"  {ds:10s} -> leidas: {leidas:>12,} | "
            f"limpias: {limpias:>12,} | rechazadas: {rechazadas:>8,}"
        )

    print("\nOK Limpieza completada.")
    print(f"  Archivos de salida en: {OUTPUT_DIR}\n")

    return {
        "eda":             df_eda,
        "ira_neumonia":    df_ira_neumonia,
        "ira_no_neumonia": df_ira_no_neumonia,
        "dengue":          df_dengue,
    }


if __name__ == "__main__":
    datos_limpios = main()
