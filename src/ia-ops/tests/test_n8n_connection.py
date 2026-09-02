import requests

# URL del webhook conversacional NLQ, accesible vía túnel SSH a la VM de Azure.
# TODO: reemplazar por la Production URL pública una vez el Arquitecto
# configure el reverse proxy (bloqueo documentado en HU-06).
WEBHOOK_URL = "http://localhost:5678/webhook/consulta"


def test_webhook_esta_vivo():
    """
    Smoke test: confirma que el webhook de consulta NLQ responde 
    correctamente (HTTP 200) ante una pregunta simple, sin evaluar 
    todavía el contenido de la respuesta.
    """
    response = requests.post(
        WEBHOOK_URL,
        json={"pregunta": "test de conectividad"},
        timeout=45
    )
    assert response.status_code == 200
    
def test_respuesta_incluye_contexto_epidemiologico_y_climatico():
    """
    Prueba de integración de datos: confirma que la respuesta del 
    webhook refleja contenido de AMBAS fuentes combinadas por el nodo 
    Merge (boletín epidemiológico + datos climáticos), no solo una 
    de las dos.
    """
    response = requests.post(
        WEBHOOK_URL,
        json={"pregunta": "Dame un resumen de la situación epidemiológica y el clima actual"},
        timeout=45
    )

    assert response.status_code == 200

    data = response.json()
    texto_respuesta = data["output"].lower()

    # Palabras clave que indican contexto epidemiológico
    tiene_contexto_epidemiologico = any(
        palabra in texto_respuesta
        for palabra in ["caso", "dengue", "eda", "ira", "epidemiol", "brote"]
    )

    # Palabras clave que indican contexto climático
    tiene_contexto_climatico = any(
        palabra in texto_respuesta
        for palabra in ["clima", "temperatura", "lluvia", "precipitaci", "humedad"]
    )

    assert tiene_contexto_epidemiologico, "La respuesta no muestra contexto epidemiológico"
    assert tiene_contexto_climatico, "La respuesta no muestra contexto climático"
    