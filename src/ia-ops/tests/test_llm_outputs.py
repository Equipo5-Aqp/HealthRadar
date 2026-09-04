import os
import requests
import time
# URL del webhook conversacional NLQ. En CI (GitHub Actions) usa la URL
# pública vía proxy de Next.js (secret N8N_NLQ_WEBHOOK_URL, puerto 3000).
# En ejecución local usa el fallback vía túnel SSH a la VM de Azure.
WEBHOOK_URL = os.environ.get(
    "N8N_NLQ_WEBHOOK_URL",
    "http://localhost:5678/webhook/consulta"  # fallback local con túnel SSH
)
PAUSA_ENTRE_PRUEBAS = 45

def test_respuesta_tiene_schema_valido():
    """
    Prueba de esquema: confirma que la respuesta es JSON válido y 
    contiene el campo "output" esperado por el resto del sistema.
    """
    response = requests.post(
        WEBHOOK_URL,
        json={"pregunta": "¿Cuál es la situación epidemiológica actual?"},
        timeout=45
    )

    assert response.status_code == 200

    data = response.json()
    assert "output" in data, "La respuesta no contiene el campo 'output' esperado"


def test_output_no_esta_vacio():
    """
    Prueba de calidad mínima: confirma que el campo 'output' no llega 
    vacío. Un output vacío suele indicar un fallo silencioso aguas 
    arriba (ej. rate limit del LLM), no una respuesta legítima.
    """
    time.sleep(PAUSA_ENTRE_PRUEBAS)
    response = requests.post(
        WEBHOOK_URL,
        json={"pregunta": "¿Cuál es la situación epidemiológica actual?"},
        timeout=45
    )

    assert response.status_code == 200

    data = response.json()
    output = data.get("output", "")
    assert len(output.strip()) > 0, "El campo 'output' llegó vacío"


def test_output_tiene_longitud_minima_razonable():
    """
    Prueba de calidad mínima: confirma que la respuesta no está 
    truncada o cortada de forma anómala (una respuesta real del 
    sistema siempre incluye contexto, no una sola palabra).
    """
    time.sleep(PAUSA_ENTRE_PRUEBAS)
    response = requests.post(
        WEBHOOK_URL,
        json={"pregunta": "¿Cuál es la situación epidemiológica actual?"},
        timeout=45
    )

    assert response.status_code == 200

    data = response.json()
    output = data.get("output", "")
    assert len(output.strip()) > 20, (
        f"El output es sospechosamente corto ({len(output)} caracteres): {output}"
    )


def test_sin_mensajes_de_error_del_sistema():
    """
    Prueba de calidad mínima: confirma que la respuesta no contiene 
    mensajes de error internos filtrados (de n8n, del proxy de 
    Next.js, o del propio LLM), que indicarían un fallo silencioso 
    presentado como si fuera una respuesta válida.
    """
    time.sleep(PAUSA_ENTRE_PRUEBAS)
    response = requests.post(
        WEBHOOK_URL,
        json={"pregunta": "¿Cuál es la situación epidemiológica actual?"},
        timeout=45
    )

    assert response.status_code == 200

    data = response.json()
    output = data.get("output", "").lower()

    frases_de_error_del_sistema = [
        "error interno conectando con n8n",
        "unexpected end of json input",
        "workflow did not return data",
        "execution was not found",
        "internal server error",
        "error 500",
    ]

    hay_error_filtrado = any(
        frase in output for frase in frases_de_error_del_sistema
    )

    assert not hay_error_filtrado, (
        f"La respuesta contiene un mensaje de error del sistema filtrado: {output}"
    )