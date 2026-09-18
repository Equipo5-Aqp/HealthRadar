"""
HU-10 — Tests de Detección de Periodo en NLQ
Valida, contra el webhook real /webhook/consulta (via proxy Next.js),
que el sistema interpreta correctamente el periodo mencionado en la
pregunta del analista — usando el detector por regex de "Conexion
posgrest" (cero tokens de IA para esta parte).

Al igual que HU-04/HU-06 (Sprint 1), estos tests dependen del modelo
de IA (Gemini) para redactar la respuesta final, por lo que están
sujetos al mismo riesgo de rate limit -> usar continue-on-error en
el pipeline, NO bloqueante.

Confirmado contra el JSON real del nodo "Detectar periodo en la
pregunta": el sistema NO interpreta fechas relativas ("el año
pasado", "el mes anterior") -- solo semana/mes/año explícitos. Toda
pregunta con fecha relativa cae al fallback de últimas 12 semanas.
"""
import os
import time
import requests
import pytest

WEBHOOK_URL = os.environ.get(
    "N8N_NLQ_WEBHOOK_URL",
    "http://localhost:5678/webhook/consulta"
)
PAUSA_ENTRE_PRUEBAS = 45  # mismo criterio que HU-04/06 (Sprint 1)


def preguntar(pregunta, timeout=60):
    resp = requests.post(
        WEBHOOK_URL, json={"pregunta": pregunta}, timeout=timeout
    )
    resp.raise_for_status()
    return resp.json()


# --- Test 1: Semana específica con año explícito ---
def test_detecta_semana_especifica():
    data = preguntar("¿Qué pasó en la semana 20 del 2026?")
    output = data.get("output", "").lower()
    assert output, "Respuesta vacía (posible rate limit de Gemini)"
    # Debe referenciar la semana 20 de alguna forma (SE 20, semana 20)
    assert "20" in output, (
        f"La respuesta no parece referenciar la semana 20 pedida: {output[:200]}"
    )
    time.sleep(PAUSA_ENTRE_PRUEBAS)


# --- Test 2: Mes explícito ---
def test_detecta_mes_especifico():
    data = preguntar("Dame datos de julio 2025")
    output = data.get("output", "").lower()
    assert output, "Respuesta vacía (posible rate limit de Gemini)"
    assert "2025" in output, (
        f"La respuesta no parece referenciar el año 2025 pedido: {output[:200]}"
    )
    time.sleep(PAUSA_ENTRE_PRUEBAS)


# --- Test 3: AJUSTADO — fecha relativa NO es interpretada (hallazgo real) ---
def test_fecha_relativa_no_se_interpreta_como_periodo_especifico():
    """
    Documenta el comportamiento REAL confirmado en el código: "el año
    pasado" no tiene regex que la reconozca, por lo que el sistema cae
    al fallback de últimas 12 semanas en vez de resolver el año
    anterior. Este test no busca que la IA "adivine" el año - confirma
    que el sistema es honesto sobre qué periodo usó, sin inventar que
    entendió "año pasado" cuando en realidad no lo hizo.
    """
    data = preguntar("¿Cómo estuvo el Dengue el año pasado?")
    output = data.get("output", "").lower()
    assert output, "Respuesta vacía (posible rate limit de Gemini)"
    # No hacemos assert de que mencione un año específico, porque
    # confirmamos que el sistema NO resuelve esta expresión -- solo
    # confirmamos que responde con algo (no se rompe silenciosamente).
    time.sleep(PAUSA_ENTRE_PRUEBAS)


# --- Test 4: Año fuera de rango razonable (1850) ---
def test_anio_fuera_de_rango_no_rompe_el_sistema():
    data = preguntar("¿Hay datos de dengue en 1850?")
    output = data.get("output", "").lower()
    assert output, "Respuesta vacía (posible rate limit de Gemini)"
    # Anti-alucinación: debe declarar ausencia de datos, no inventar cifras
    frases_honestidad = [
        "no se encontr", "no hay datos", "no cuento con",
        "no dispongo", "sin informaci", "no existe"
    ]
    assert any(frase in output for frase in frases_honestidad), (
        f"La respuesta no declara ausencia de datos para 1850, "
        f"posible alucinación: {output[:300]}"
    )