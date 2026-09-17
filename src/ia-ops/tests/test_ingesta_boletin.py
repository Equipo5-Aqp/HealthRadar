"""
HU-08 — Tests de la Capa de Ingesta de Boletines (Fase A + Fase B)
A diferencia de HU-07, este flujo NO expone webhook (solo scheduleTrigger),
por lo que las pruebas verifican ESTADO en PostgreSQL directamente,
vía túnel SSH, en lugar de HTTP.

Confirmado contra los JSON reales de "Recoleccion de Links (Fase A)" y
"Procesar 1 Boletin Pendiente (Fase B)", más consulta directa a la DB:
- Fase B NO inserta en caso_dengue/eda/ira/ira_nn (solo confirmado:
  únicos 4 workflows existentes en el proyecto no incluyen ese paso).
- Fase A previene duplicados vía ON CONFLICT (anio, semana_epidemiologica)
  DO NOTHING — confirmado sin duplicados en datos reales.
- Fase B valida que el resumen incluya la línea "SEMANA EPIDEMIOLOGICA: N"
  antes de marcar procesado=TRUE (o lanza error y detiene el flujo).

PENDIENTE (documentado, no bloqueante): estos tests requieren túnel SSH
activo a la VM de Azure. No están integrados a GitHub Actions todavía —
requiere decisión de Arquitecto sobre exponer la clave SSH como secret,
o publicar Postgres de otra forma segura.
"""
import os
import psycopg2
import pytest

DB_CONFIG = {
    "host": os.environ.get("HEALTHRADAR_DB_HOST", "localhost"),
    "port": int(os.environ.get("HEALTHRADAR_DB_PORT", 5433)),
    "dbname": os.environ.get("HEALTHRADAR_DB_NAME", "healthradar_db"),
    "user": os.environ.get("HEALTHRADAR_DB_USER", "healthradar_admin"),
    "password": os.environ.get("HEALTHRADAR_DB_PASSWORD"),
}


@pytest.fixture
def db_connection():
    """Requiere túnel SSH activo. Ver docstring del módulo."""
    if not DB_CONFIG["password"]:
        pytest.skip(
            "HEALTHRADAR_DB_PASSWORD no configurado — omitiendo tests "
            "de DB (requieren túnel SSH activo + credenciales)."
        )
    conn = psycopg2.connect(**DB_CONFIG)
    yield conn
    conn.close()


# --- Test 1: Hay boletines pendientes por procesar (estado del backlog) ---
def test_existen_boletines_en_ambos_estados(db_connection):
    cur = db_connection.cursor()
    cur.execute(
        "SELECT procesado, COUNT(*) FROM boletin_descubierto GROUP BY procesado;"
    )
    estados = dict(cur.fetchall())
    assert True in estados or False in estados, (
        "La tabla boletin_descubierto está completamente vacía — "
        "Fase A nunca corrió o no encontró nada."
    )
    # Informativo, no assertion dura: deja constancia del tamaño del backlog
    print(f"Estado actual — pendientes: {estados.get(False, 0)}, "
          f"procesados: {estados.get(True, 0)}")


# --- Test 2: Todo boletín marcado procesado=TRUE tiene resumen real ---
def test_boletines_procesados_no_tienen_resumen_vacio(db_connection):
    cur = db_connection.cursor()
    cur.execute(
        "SELECT id_boletin, anio, semana_epidemiologica "
        "FROM boletin_descubierto "
        "WHERE procesado = TRUE AND btrim(resumen) = '';"
    )
    huerfanos = cur.fetchall()
    assert huerfanos == [], (
        f"Hay {len(huerfanos)} boletines marcados procesado=TRUE pero con "
        f"resumen vacío (dato corrupto): {huerfanos}"
    )


# --- Test 3: El resumen respeta el contrato que exige Fase B ---
def test_resumen_incluye_linea_semana_epidemiologica(db_connection):
    cur = db_connection.cursor()
    cur.execute(
        "SELECT id_boletin, resumen FROM boletin_descubierto "
        "WHERE procesado = TRUE LIMIT 20;"
    )
    filas = cur.fetchall()
    if not filas:
        pytest.skip("No hay boletines procesados todavía para validar.")

    sin_linea = [
        id_b for id_b, resumen in filas
        if "SEMANA EPIDEMIOLOGICA" not in resumen.upper()
    ]
    assert sin_linea == [], (
        f"Boletines procesados sin la línea de contrato esperada "
        f"(debería ser imposible, Fase B valida esto antes de guardar): "
        f"{sin_linea}"
    )


# --- Test 4: Idempotencia — sin duplicados (anio, semana) ---
def test_sin_duplicados_anio_semana(db_connection):
    cur = db_connection.cursor()
    cur.execute(
        "SELECT anio, semana_epidemiologica, COUNT(*) "
        "FROM boletin_descubierto "
        "GROUP BY anio, semana_epidemiologica "
        "HAVING COUNT(*) > 1;"
    )
    duplicados = cur.fetchall()
    assert duplicados == [], (
        f"Se encontraron duplicados de (anio, semana) — el "
        f"ON CONFLICT DO NOTHING de Fase A no está funcionando: {duplicados}"
    )


# --- Test 5: Datos climáticos dentro de rangos físicamente posibles ---
def test_dato_climatico_valores_en_rango_fisico(db_connection):
    cur = db_connection.cursor()
    cur.execute(
        "SELECT id_dato_climatico, humedad_promedio, "
        "temp_max_promedio, temp_min_promedio "
        "FROM dato_climatico "
        "WHERE humedad_promedio < 0 OR humedad_promedio > 100 "
        "   OR temp_max_promedio < temp_min_promedio "
        "   OR temp_max_promedio > 50 OR temp_min_promedio < -20;"
    )
    invalidos = cur.fetchall()
    assert invalidos == [], (
        f"Datos climáticos fuera de rango físico posible (humedad "
        f"fuera de 0-100%, o temp_max < temp_min, o valores extremos "
        f"irreales): {invalidos}"
    )