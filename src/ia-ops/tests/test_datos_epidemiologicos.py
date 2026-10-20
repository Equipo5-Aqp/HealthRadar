"""
HU-07 / #154 - Tests del webhook de datos historicos (determinista, sin IA).

Ruta publica (Multi-Zone, con sesion): POST /historicos/api/historicos
  -> BFF de mf-historicos -> n8n POST /webhook/historicos

Comportamiento vigente del flujo "Conexion de posgrestV4" (verificado en el JSON y en produccion):
- "Validar entrada" usa validarFiltrosConsulta (@healthradar/core): lista cerrada para
  tabla/departamento y enteros acotados para anio/pagina. Si no cumple -> 400.
- Las queries usan parametros ($1,$2,$3): no hay concatenacion de valores del usuario.
- "pagina" es opcional (default 1), 100 filas por pagina.

Estado de los 3 hallazgos originales de HU-07:
  1. Switch sin fallback (500)           -> CORREGIDO: tabla desconocida responde 400.
  2. Inyeccion SQL por "departamento"    -> CORREGIDO: la entrada se rechaza (400).
  3. Fuga del nombre del servicio (n8n)  -> PENDIENTE: el BFF responde "n8n respondio con
                                            codigo 400". Sigue marcado xfail (strict).

Variables de entorno:
  HR_USER, HR_PASS   cuenta de prueba. Local: si faltan, se omiten los tests.
                     En CI (CI=true): si faltan, el test FALLA (un check verde sin haber
                     probado nada no sirve).
  HR_BASE_URL        opcional (por defecto http://20.9.78.118:3000)
"""
import os

import pytest
import requests

BASE_URL = (os.environ.get("HR_BASE_URL") or "http://20.9.78.118:3000").rstrip("/")
URL_LOGIN = f"{BASE_URL}/api/auth/login"
URL_HIST = f"{BASE_URL}/historicos/api/historicos"
TIMEOUT = 40

# Campos confirmados en las queries SQL del flujo V4 (cada rama del Switch)
SCHEMAS = {
    "dengue": {"id_caso_dengue", "ubigeo", "anio", "semana", "id_diresa",
               "enfermedad", "diagnostic", "edad", "tipo_edad", "sexo"},
    "eda": {"id_caso_eda", "ubigeo", "anio", "semana", "id_diresa",
            "grupo_etario", "episodios", "hospitalizados", "defunciones"},
    "ira_neumonia": {"id_caso_ira", "ubigeo", "anio", "semana", "id_diresa",
                     "grupo_etario", "casos_neumonia", "hospitalizados", "defunciones"},
    "ira_no_neumonia": {"id_caso_ira_nn", "ubigeo", "anio", "semana",
                        "id_diresa", "casos"},
}


@pytest.fixture(scope="module")
def sesion():
    usuario, clave = os.environ.get("HR_USER"), os.environ.get("HR_PASS")
    if not usuario or not clave:
        msg = "Faltan HR_USER / HR_PASS en el entorno"
        if os.environ.get("CI") == "true":
            pytest.fail(msg + " (en CI no se omite: seria un check verde sin probar nada)")
        pytest.skip(msg)
    s = requests.Session()
    r = s.post(URL_LOGIN, json={"email": usuario, "password": clave}, timeout=30)
    assert r.status_code == 200, f"Login fallo: HTTP {r.status_code}"
    return s


def _pedir(sesion, cuerpo):
    return sesion.post(URL_HIST, json=cuerpo, timeout=TIMEOUT)


# ------------------------------ sesion --------------------------------------
def test_sin_sesion_devuelve_401():
    r = requests.post(URL_HIST, json={"tabla": "dengue"}, timeout=20)
    assert r.status_code == 401
    assert r.json().get("codigo") == "SIN_SESION"


# ------------------------- smoke / equivalencia / schema --------------------
def test_dengue_responde_200_con_filas(sesion):
    r = _pedir(sesion, {"tabla": "dengue"})
    assert r.status_code == 200, f"HTTP {r.status_code}"
    datos = r.json()
    assert isinstance(datos, list) and 1 <= len(datos) <= 100


@pytest.mark.parametrize("tabla", ["eda", "ira_neumonia", "ira_no_neumonia"])
def test_otras_tablas_responden_200(sesion, tabla):
    r = _pedir(sesion, {"tabla": tabla})
    assert r.status_code == 200, f"{tabla}: HTTP {r.status_code}"


@pytest.mark.parametrize("tabla", list(SCHEMAS))
def test_schema_de_cada_tabla(sesion, tabla):
    r = _pedir(sesion, {"tabla": tabla})
    assert r.status_code == 200, f"{tabla}: HTTP {r.status_code}"
    datos = r.json()
    assert datos, f"{tabla}: sin filas para validar el schema"
    for fila in datos[:20]:
        assert set(fila.keys()) == SCHEMAS[tabla], f"{tabla}: {set(fila.keys()) ^ SCHEMAS[tabla]}"


# ----------------------------- filtros --------------------------------------
def test_filtro_por_anio(sesion):
    r = _pedir(sesion, {"tabla": "dengue", "anio": 2023})
    assert r.status_code == 200, f"HTTP {r.status_code}"
    datos = r.json()
    assert datos, "Sin filas para 2023"
    assert all(f["anio"] == 2023 for f in datos)


def test_filtro_por_departamento_valido(sesion):
    """Control: un departamento valido SI filtra. Da sentido al test de inyeccion."""
    r = _pedir(sesion, {"tabla": "dengue", "departamento": "01"})
    assert r.status_code == 200, f"HTTP {r.status_code}"
    datos = r.json()
    assert all(str(f["ubigeo"]).startswith("01") for f in datos)


def test_pagina_es_opcional_default_1(sesion):
    sin_pagina = _pedir(sesion, {"tabla": "dengue"})
    pagina_1 = _pedir(sesion, {"tabla": "dengue", "pagina": 1})
    assert sin_pagina.status_code == 200 and pagina_1.status_code == 200
    assert sin_pagina.json() == pagina_1.json()


# ------------------------- casos borde / seguridad --------------------------
def test_tabla_desconocida_responde_400(sesion):
    """Hallazgo 1 CORREGIDO: antes era 500 / respuesta vacia; ahora 400 controlado."""
    r = _pedir(sesion, {"tabla": "covid19"})
    assert r.status_code == 400, f"HTTP {r.status_code}: {r.text[:200]}"


def test_departamento_no_permite_sql_injection(sesion):
    """Hallazgo 2 CORREGIDO: el payload se rechaza; si pasara, no puede traer otros departamentos."""
    r = _pedir(sesion, {"tabla": "dengue", "departamento": "01' OR '1'='1"})
    if r.status_code == 400:
        return
    assert r.status_code == 200, f"HTTP inesperado {r.status_code}: {r.text[:200]}"
    fuera = [f for f in r.json() if not str(f["ubigeo"]).startswith("01")]
    assert not fuera, f"La inyeccion devolvio {len(fuera)} filas de otros departamentos"


@pytest.mark.xfail(
    strict=True,
    reason=(
        "HALLAZGO 3 PENDIENTE (verificado en produccion): el BFF de mf-historicos responde "
        "'n8n respondio con codigo 400', lo que expone el nombre del servicio interno en un "
        "error publico. Quitar este marcador cuando el BFF devuelva un mensaje generico "
        "(y tras 2 corridas limpias)."
    ),
)
def test_error_no_filtra_nombre_de_servicio_interno(sesion):
    r = _pedir(sesion, {"tabla": "covid19"})
    assert "n8n" not in r.text.lower(), "El error filtra el nombre del servicio interno (n8n)"
