"""
HU-11 — Pruebas del Failover Multi-Modelo (webhook NLQ /api/consulta)
Confirmado contra el JSON real del workflow "Conexion posgrest":
- Cadena real: AI Agent1 -> AI Agent Gemini 2 -> AI Agent Gemini 3
- Cada nodo AI Agent tiene onError: "continueErrorOutput", retryOnFail: false
- Las 3 credenciales son cuentas distintas de Google Gemini (mismo modelo:
  gemini-3.6-flash), encadenadas para tolerar el agotamiento de UNA cuenta.

LIMITACION RECONOCIDA (documentada tambien en el informe HU-11):
Como QA de caja negra, no es posible forzar que falle especificamente
la cuenta 1 y verificar que la 2 responde - las 3 comparten el mismo
tipo de limite (cuota diaria gratuita de Gemini), por lo que desde
afuera solo se puede observar el comportamiento agregado del mecanismo:
o el failover funciona y llega una respuesta usable, o las 3 cuentas
estan agotadas simultaneamente y el sistema falla de forma controlada
(sin colgarse, sin filtrar credenciales, sin exponer errores crudos
del proveedor de IA al analista).
"""
import os
import re
import requests
import pytest

WEBHOOK_URL = os.environ.get(
    "N8N_NLQ_WEBHOOK_URL",
    "http://localhost:5678/webhook/consulta"
)

TIMEOUT_SEGUNDOS = 60  # el failover a 3 modelos puede tardar mas que una sola llamada

# Nombres de credenciales confirmados en el JSON real del workflow -
# nunca deben aparecer en una respuesta al analista.
NOMBRES_CREDENCIALES = [
    "Google Gemini(PaLM) Api account",
    "Google Gemini(PaLM) Api account 2",
    "Google Gemini(PaLM) Api account 3",
]

# Fragmentos tipicos de errores crudos de proveedores de IA que NO
# deberian llegar sin filtrar al campo 'output' de la respuesta.
FRAGMENTOS_ERROR_PROVEEDOR = [
    "quota exceeded",
    "resource_exhausted",
    "rate limit",
    "api key",
    "googlepalmapi",
]


def preguntar(pregunta):
    return requests.post(
        WEBHOOK_URL,
        json={"pregunta": pregunta},
        timeout=TIMEOUT_SEGUNDOS
    )


# --- Test 1: la respuesta llega, o falla de forma controlada (nunca cuelga) ---
def test_respuesta_siempre_llega_o_falla_controladamente():
    resp = preguntar("hola, como estas")

    # Aceptamos 200 (el failover funciono, alguna de las 3 cuentas
    # respondio) o un error HTTP identificable (todas agotadas) -
    # lo que NO se acepta es que requests.post haga timeout total
    # (eso ya seria un fallo de la prueba misma via excepcion, no
    # de este assert).
    assert resp.status_code in (200, 500, 502, 503), (
        f"Status code inesperado: {resp.status_code}. "
        f"El sistema deberia responder 200 (exito) o un error de "
        f"servidor identificable, nunca un codigo fuera de este rango."
    )


# --- Test 2: ninguna credencial interna se filtra en el error ---
def test_no_expone_credenciales_de_los_3_proveedores_en_error():
    resp = preguntar("hola, como estas")
    cuerpo = resp.text

    for nombre_credencial in NOMBRES_CREDENCIALES:
        assert nombre_credencial not in cuerpo, (
            f"El nombre de credencial interna '{nombre_credencial}' "
            f"aparece expuesto en la respuesta al analista."
        )


# --- Test 3: si responde 200, el output no trae errores crudos de proveedor ---
def test_output_no_contiene_traza_de_error_de_proveedor_ia():
    resp = preguntar("cuantos casos de dengue hubo en Lima en 2020")

    if resp.status_code != 200:
        pytest.skip(
            "El webhook no respondio 200 en este intento (probable "
            "cuota de las 3 cuentas de Gemini agotada simultaneamente, "
            "mismo hallazgo documentado en HU-10) - no aplica este check."
        )

    data = resp.json()
    output = str(data.get("output", "")).lower()

    for fragmento in FRAGMENTOS_ERROR_PROVEEDOR:
        assert fragmento not in output, (
            f"El campo 'output' contiene el fragmento de error de "
            f"proveedor '{fragmento}' sin filtrar: {output[:200]}..."
        )