"""
HU-19 (#156) - Trazabilidad en Arize Phoenix.

Objetivo: confirmar que la traza de una consulta REAL llega a Phoenix con
pregunta, respuesta, modelo, tokens y latencia, y que corresponde a ESA
interaccion (no a otra).

Flujo del test (una sola llamada real al sistema, compartida por todos los tests):
  1. Login en /api/auth/login con la cuenta de prueba (cookie hr_sesion).
  2. POST /consulta/api/consulta con una pregunta de marca unica.
  3. Consulta Phoenix (solo GET) hasta encontrar el span nlq.consulta cuya
     pregunta contiene la marca (espera hasta 180 s: la traza se escribe al
     terminar el flujo).
  4. Compara sistema vs Phoenix y cruza spans con /traces por trace_id.

Requisitos antes de correr:
  - Tunel SSH al puerto 6006 de Phoenix abierto (localhost:6006).
  - Variables de entorno HR_USER y HR_PASS cargadas (no se escriben en archivos).
  - Opcionales: HR_BASE_URL, PHOENIX_URL, PHOENIX_PROJECT.

Costo: una consulta real (~30 000 tokens de entrada, 30-90 s).
Todo lo de Phoenix es de LECTURA (GET); este test no crea ni borra trazas.
"""
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = (os.environ.get("HR_BASE_URL") or "http://20.9.78.118:3000").rstrip("/")
PHOENIX_URL = os.environ.get("PHOENIX_URL", "http://localhost:6006").rstrip("/")
PHOENIX_PROJECT = os.environ.get("PHOENIX_PROJECT", "default")

RUTA_LOGIN = "/api/auth/login"
RUTA_CONSULTA = "/consulta/api/consulta"
NOMBRE_SPAN = "nlq.consulta"

TIMEOUT_CONSULTA = 120   # nginx corta a los 60 s (504); igual buscamos la traza
ESPERA_MAX_TRAZA = 180   # segundos esperando que aparezca en Phoenix
INTERVALO = 6            # segundos entre consultas a Phoenix
TOLERANCIA_LATENCIA_MS = 1000


# ----------------------------- utilidades ---------------------------------
def _aplanar(x, pref=""):
    """Aplana atributos anidados a claves con punto (llm.model_name)."""
    plano = {}
    if isinstance(x, dict):
        for k, v in x.items():
            plano.update(_aplanar(v, f"{pref}{k}."))
    else:
        plano[pref[:-1]] = x
    return plano


def _fecha(txt):
    return datetime.fromisoformat(txt.replace("Z", "+00:00"))


def _iso_utc(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _phoenix_get(ruta, params):
    r = requests.get(f"{PHOENIX_URL}{ruta}", params=params, timeout=20)
    assert r.status_code == 200, (
        f"Phoenix respondio HTTP {r.status_code} en {ruta}. "
        "Revisa que el tunel al 6006 siga abierto."
    )
    return r.json()


# ------------------------------ fixtures ----------------------------------
@pytest.fixture(scope="module")
def interaccion():
    """Hace login, envia UNA consulta real y devuelve lo que paso."""
    usuario = os.environ.get("HR_USER")
    clave = os.environ.get("HR_PASS")
    if not usuario or not clave:
        pytest.skip("Faltan HR_USER / HR_PASS en el entorno")

    sesion = requests.Session()
    r = sesion.post(
        f"{BASE_URL}{RUTA_LOGIN}",
        json={"email": usuario, "password": clave},
        timeout=30,
    )
    assert r.status_code == 200, f"Login fallo: HTTP {r.status_code}"

    marca = f"prueba trazabilidad QA HU19 {uuid.uuid4().hex[:10]}"
    t0 = datetime.now(timezone.utc) - timedelta(seconds=30)

    resp_http, cuerpo = None, {}
    try:
        resp = sesion.post(
            f"{BASE_URL}{RUTA_CONSULTA}",
            json={"pregunta": marca},
            timeout=TIMEOUT_CONSULTA,
        )
        resp_http = resp.status_code
        if resp.headers.get("content-type", "").startswith("application/json"):
            cuerpo = resp.json()
    except requests.exceptions.RequestException as e:
        resp_http = f"error de red: {type(e).__name__}"

    # Buscar la traza en Phoenix (solo lectura)
    spans = []
    limite = time.time() + ESPERA_MAX_TRAZA
    while time.time() < limite:
        datos = _phoenix_get(
            f"/v1/projects/{PHOENIX_PROJECT}/spans",
            {"name": NOMBRE_SPAN, "start_time": _iso_utc(t0), "limit": 50},
        )
        spans = [
            s for s in datos.get("data", [])
            if marca in str(_aplanar(s.get("attributes", {})).get("input.value", ""))
        ]
        if spans:
            break
        time.sleep(INTERVALO)

    spans.sort(key=lambda s: s["start_time"])
    return {
        "marca": marca,
        "t0": t0,
        "http": resp_http,
        "cuerpo": cuerpo,
        "spans": spans,
    }


@pytest.fixture(scope="module")
def span(interaccion):
    if not interaccion["spans"]:
        pytest.fail("No hay span: la traza no llego a Phoenix (ver test_traza_llega_a_phoenix)")
    return interaccion["spans"][-1]  # el ultimo intento (si hubo failover)


# ------------------------------- tests ------------------------------------
def test_traza_llega_a_phoenix(interaccion):
    """La consulta real deja un span nlq.consulta en Phoenix."""
    print(f"\n[info] HTTP de la consulta: {interaccion['http']}")
    print(f"[info] spans encontrados con la marca: {len(interaccion['spans'])}")
    assert interaccion["spans"], (
        f"No aparecio traza en {ESPERA_MAX_TRAZA} s para la marca "
        f"'{interaccion['marca']}' (HTTP consulta: {interaccion['http']})"
    )


def test_traza_corresponde_a_la_interaccion(interaccion, span):
    """La pregunta registrada es la enviada; modelo y respuesta coinciden con lo devuelto."""
    a = _aplanar(span.get("attributes", {}))
    assert a.get("input.value") == interaccion["marca"], "La pregunta en Phoenix no es la enviada"
    assert str(a.get("output.value", "")).strip(), "output.value vacio en Phoenix"

    if interaccion["http"] != 200:
        pytest.skip(f"La consulta devolvio {interaccion['http']}: se omite comparar respuesta (la traza si llego)")

    cuerpo = interaccion["cuerpo"]
    salida = str(cuerpo.get("output", "")).strip()
    if salida:
        assert salida[:80] in str(a["output.value"]) or str(a["output.value"])[:80] in salida, (
            "El inicio de la respuesta del sistema no coincide con output.value de Phoenix"
        )
    modelo_api = cuerpo.get("modelo_usado")
    if modelo_api:
        modelo_ph = str(a.get("llm.model_name", ""))
        assert modelo_api in modelo_ph or modelo_ph in modelo_api, (
            f"Modelo distinto: sistema={modelo_api} / Phoenix={modelo_ph}"
        )


def test_latencia_coherente(span):
    """healthradar.latencia_ms coincide con end_time - start_time."""
    a = _aplanar(span.get("attributes", {}))
    lat = a.get("healthradar.latencia_ms")
    assert lat is not None, "Falta healthradar.latencia_ms"
    real_ms = (_fecha(span["end_time"]) - _fecha(span["start_time"])).total_seconds() * 1000
    assert abs(real_ms - float(lat)) <= TOLERANCIA_LATENCIA_MS, (
        f"latencia_ms={lat} vs end-start={real_ms:.0f} ms"
    )


def test_tokens_coherentes_span_vs_trace(interaccion, span):
    """Los tokens del span suman su total y coinciden con /traces (cruce por trace_id)."""
    a = _aplanar(span.get("attributes", {}))
    prompt = int(a["llm.token_count.prompt"])
    comp = int(a["llm.token_count.completion"])
    total = int(a["llm.token_count.total"])
    assert prompt + comp == total, f"{prompt} + {comp} != {total}"

    trace_id = span["context"]["trace_id"]
    datos = _phoenix_get(
        f"/v1/projects/{PHOENIX_PROJECT}/traces",
        {"start_time": _iso_utc(interaccion["t0"]), "limit": 100},
    )
    trazas = [t for t in datos.get("data", []) if t.get("trace_id") == trace_id]
    assert trazas, f"No encontre en /traces el trace_id {trace_id}"
    t = trazas[0]
    assert (t["token_count_prompt"], t["token_count_completion"], t["token_count_total"]) == (
        prompt, comp, total
    ), "Los tokens de /traces no coinciden con los del span"


def test_atributos_clave_presentes(span):
    """La traza trae los atributos que HealthRadar promete registrar."""
    a = _aplanar(span.get("attributes", {}))
    for clave in ["input.value", "output.value", "llm.model_name",
                  "healthradar.proveedor", "healthradar.flujo", "session.id"]:
        assert str(a.get(clave, "")).strip(), f"Falta el atributo {clave}"
    assert span.get("status_code") in ("OK", "UNSET"), f"status_code={span.get('status_code')}"
