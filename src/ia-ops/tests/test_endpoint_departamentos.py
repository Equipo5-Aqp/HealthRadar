"""
HU-22 (#159) - Endpoint de casos por departamento (mapa de calor).

Ruta publica (Multi-Zone): POST /historicos/api/departamentos
  -> BFF de mf-historicos -> n8n POST /webhook/departamentos
Contrato: { "tabla": "dengue|eda|ira_neumonia|ira_no_neumonia", "anio": 2023 (opcional) }
Respuesta: 25 filas { codigo_departamento, departamento, total_casos }.
Sin "anio" = acumulado de todos los anios.

Es determinista (sin IA): no gasta cuota. Requiere sesion (nginx auth_request).

Variables de entorno:
  HR_USER, HR_PASS            cuenta de prueba (obligatorias; si faltan, se omiten los tests con sesion)
  HR_BASE_URL                 opcional (por defecto http://20.9.78.118:3000)
Solo para el cotejo contra Postgres (si faltan, ese test se omite):
  HEALTHRADAR_DB_PASSWORD     (y opcionales HEALTHRADAR_DB_HOST/PORT/NAME/USER; puerto 5433 por tunel)
"""
import os

import pytest
import requests

BASE_URL = (os.environ.get("HR_BASE_URL") or "http://20.9.78.118:3000").rstrip("/")
URL_LOGIN = f"{BASE_URL}/api/auth/login"
URL_DEP = f"{BASE_URL}/historicos/api/departamentos"

TABLAS = ["dengue", "eda", "ira_neumonia", "ira_no_neumonia"]
CODIGOS = [f"{i:02d}" for i in range(1, 26)]
TIMEOUT = 40


@pytest.fixture(scope="module")
def sesion():
    usuario, clave = os.environ.get("HR_USER"), os.environ.get("HR_PASS")
    if not usuario or not clave:
        pytest.skip("Faltan HR_USER / HR_PASS en el entorno")
    s = requests.Session()
    r = s.post(URL_LOGIN, json={"email": usuario, "password": clave}, timeout=30)
    assert r.status_code == 200, f"Login fallo: HTTP {r.status_code}"
    return s


def _pedir(sesion, cuerpo):
    return sesion.post(URL_DEP, json=cuerpo, timeout=TIMEOUT)


@pytest.fixture(scope="module")
def dengue_2023(sesion):
    r = _pedir(sesion, {"tabla": "dengue", "anio": 2023})
    assert r.status_code == 200, f"HTTP {r.status_code}"
    return r.json()


# ------------------------------ smoke / schema ------------------------------
def test_smoke_dengue_devuelve_25_filas(dengue_2023):
    assert isinstance(dengue_2023, list)
    assert len(dengue_2023) == 25


def test_schema_y_codigos_de_departamento(dengue_2023):
    for fila in dengue_2023:
        assert set(fila.keys()) == {"codigo_departamento", "departamento", "total_casos"}, fila
        assert isinstance(fila["total_casos"], int) and fila["total_casos"] >= 0, fila
        assert str(fila["departamento"]).strip(), fila
    codigos = [f["codigo_departamento"] for f in dengue_2023]
    assert sorted(codigos) == CODIGOS, "Los codigos deben ser 01..25, sin repetir"


@pytest.mark.parametrize("tabla", TABLAS)
def test_todas_las_tablas_responden_25_filas(sesion, tabla):
    r = _pedir(sesion, {"tabla": tabla, "anio": 2023})
    assert r.status_code == 200, f"{tabla}: HTTP {r.status_code}"
    datos = r.json()
    assert len(datos) == 25, f"{tabla}: {len(datos)} filas"
    assert sorted(f["codigo_departamento"] for f in datos) == CODIGOS


def test_sin_anio_es_acumulado_y_no_menor_que_un_anio(sesion, dengue_2023):
    r = _pedir(sesion, {"tabla": "dengue"})
    assert r.status_code == 200, f"HTTP {r.status_code}"
    acumulado = sum(f["total_casos"] for f in r.json())
    un_anio = sum(f["total_casos"] for f in dengue_2023)
    assert acumulado >= un_anio, f"acumulado={acumulado} < 2023={un_anio}"


# ------------------------------ casos borde ---------------------------------
def test_sin_sesion_devuelve_401():
    r = requests.post(URL_DEP, json={"tabla": "dengue"}, timeout=20)
    assert r.status_code == 401
    assert r.json().get("codigo") == "SIN_SESION"


def test_tabla_invalida_se_rechaza_con_400(sesion):
    r = _pedir(sesion, {"tabla": "covid19"})
    assert r.status_code == 400, f"HTTP {r.status_code}: {r.text[:200]}"
    assert "Traceback" not in r.text and "stack" not in r.text.lower()


def test_inyeccion_sql_en_tabla_se_rechaza(sesion):
    r = _pedir(sesion, {"tabla": "dengue' OR '1'='1"})
    assert r.status_code == 400, f"HTTP {r.status_code}: {r.text[:200]}"


def test_anio_invalido_no_rompe_el_endpoint(sesion):
    """Anio con texto/inyeccion: debe rechazarse (400) o ignorarse; nunca 500 ni filas extra."""
    r = _pedir(sesion, {"tabla": "dengue", "anio": "2023' OR '1'='1"})
    assert r.status_code in (200, 400), f"HTTP {r.status_code}: {r.text[:200]}"
    if r.status_code == 200:
        assert len(r.json()) == 25


# --------------------- cotejo contra Postgres (opcional) --------------------
def test_cotejo_dengue_2023_contra_postgres(dengue_2023):
    """El total por departamento de la API coincide con un COUNT directo en Postgres."""
    clave = os.environ.get("HEALTHRADAR_DB_PASSWORD")
    if not clave:
        pytest.skip("Sin HEALTHRADAR_DB_PASSWORD (y tunel al 5433): se omite el cotejo")
    psycopg2 = pytest.importorskip("psycopg2")
    conn = psycopg2.connect(
        host=os.environ.get("HEALTHRADAR_DB_HOST", "localhost"),
        port=int(os.environ.get("HEALTHRADAR_DB_PORT", 5433)),
        dbname=os.environ.get("HEALTHRADAR_DB_NAME", "healthradar_db"),
        user=os.environ.get("HEALTHRADAR_DB_USER", "healthradar_admin"),
        password=clave,
    )
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT LEFT(c.ubigeo, 2), COUNT(*) FROM caso_dengue c "
            "JOIN periodo_epidemiologico p ON p.id_periodo = c.id_periodo "
            "WHERE p.anio = 2023 GROUP BY 1"
        )
        real = {cod: int(n) for cod, n in cur.fetchall()}
    finally:
        conn.close()
    api = {f["codigo_departamento"]: f["total_casos"] for f in dengue_2023}
    diferencias = {c: (api[c], real.get(c, 0)) for c in CODIGOS if api[c] != real.get(c, 0)}
    assert not diferencias, f"Difieren (API, Postgres) por departamento: {diferencias}"
