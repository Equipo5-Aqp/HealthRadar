"""
HU-07 — Tests del Webhook Postgres/Switch (/webhook/historicos)
Flujo determinista, sin IA, sin rate limit — estos tests SÍ bloquean PR
(excepto los marcados xfail, que documentan bugs reales pendientes de Backend).

Confirmado contra el JSON real del workflow "Conexion de posgrest":
- El Switch (4 reglas, sin fallback configurado) enruta por el campo "tabla".
- "departamento" se concatena sin sanitizar en el WHERE (SQL injection real).
- "pagina" es opcional, default 1 (Number($json.body.pagina || 1)).
"""
import os
import requests
import pytest

WEBHOOK_URL = os.environ.get(
    "N8N_HISTORICOS_WEBHOOK_URL",
    "http://localhost:5678/webhook/historicos"
)

# Schemas confirmados desde las queries SQL reales de cada rama del Switch
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


# --- Test 1: Smoke test — dengue ---
def test_webhook_dengue_responde_200():
    resp = requests.post(WEBHOOK_URL, json={"tabla": "dengue"}, timeout=10)
    assert resp.status_code == 200


# --- Test 2: Equivalencia — las otras 3 tablas ---
@pytest.mark.parametrize("tabla", ["eda", "ira_neumonia", "ira_no_neumonia"])
def test_webhook_otras_tablas_responde_200(tabla):
    resp = requests.post(WEBHOOK_URL, json={"tabla": tabla}, timeout=10)
    assert resp.status_code == 200


# --- Tests 3 y 4 (schema) van en Postman/Newman, no aquí — ver
#     tests/postman/healthradar-data-collection.json ---


# --- Test 5: Caso borde — tabla desconocida ---
@pytest.mark.xfail(
    strict=True,
    reason=(
        "BUG CONOCIDO (confirmado con curl -i en 2 corridas independientes, "
        "reportado a Backend): el nodo Switch no tiene fallback configurado. "
        "Ante 'tabla' desconocida, n8n devuelve un body vacío/inválido y el "
        "proxy de Next.js responde consistentemente 500 con "
        "'Error interno conectando con n8n: Unexpected end of JSON input' "
        "— que además filtra el nombre del servicio interno (n8n) en un "
        "mensaje de error público. Quitar este marcador cuando Backend "
        "agregue la rama de fallback y el proxy devuelva un error genérico "
        "sin detalles internos."
    )
)
def test_tabla_desconocida_responde_controladamente():
    resp = requests.post(WEBHOOK_URL, json={"tabla": "covid19"}, timeout=8)
    data = resp.json()

    # Comportamiento esperado UNA VEZ CORREGIDO:
    # 1. Nunca 500 (error controlado, no excepción sin manejar)
    assert resp.status_code in (200, 400, 404), (
        f"Status inesperado: {resp.status_code} — body: {data}"
    )
    # 2. El mensaje de error no debe revelar el nombre de servicios internos
    mensaje = str(data).lower()
    assert "n8n" not in mensaje, (
        "El error filtra el nombre del servicio interno (n8n) al cliente."
    )


# --- Test 6: SQL Injection vía "departamento" ---
@pytest.mark.xfail(
    strict=True,
    reason=(
        "VULNERABILIDAD CONOCIDA (reportada a Backend/Arquitecto): "
        "'departamento' se concatena sin sanitizar en el WHERE "
        "(LEFT(c.ubigeo,2) = '<valor>'). Un payload tipo "
        "\"04' OR '1'='1\" rompe el filtro y devuelve registros de "
        "TODOS los departamentos. Quitar este marcador cuando se "
        "parametrice la query (usar $1 en vez de concatenación)."
    )
)
def test_departamento_no_permite_sql_injection():
    payload_inyectado = {"tabla": "dengue", "departamento": "04' OR '1'='1"}
    payload_legitimo = {"tabla": "dengue", "departamento": "04"}

    resp_inyectado = requests.post(WEBHOOK_URL, json=payload_inyectado, timeout=10)
    resp_legitimo = requests.post(WEBHOOK_URL, json=payload_legitimo, timeout=10)

    data_inyectado = resp_inyectado.json()
    data_legitimo = resp_legitimo.json()

    # Si la inyección NO funciona, el filtro roto no debería devolver
    # más registros que una consulta legítima del mismo departamento.
    assert len(data_inyectado) <= len(data_legitimo), (
        "El payload inyectado devolvió más registros que el filtro "
        "legítimo — el WHERE fue bypaseado."
    )


# --- Bonus: paginación opcional (confirmado por la query, no bug) ---
def test_pagina_es_opcional_default_1():
    resp_sin_pagina = requests.post(WEBHOOK_URL, json={"tabla": "dengue"}, timeout=10)
    resp_pagina_1 = requests.post(
        WEBHOOK_URL, json={"tabla": "dengue", "pagina": 1}, timeout=10
    )
    assert resp_sin_pagina.json() == resp_pagina_1.json()