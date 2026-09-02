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

def test_advierte_desfase_temporal_entre_fuentes():
    """
    Prueba de calidad de respuesta: confirma que el sistema advierte 
    explícitamente cuando el boletín epidemiológico y los datos 
    climáticos corresponden a periodos distintos, en vez de mezclarlos 
    silenciosamente como si fueran del mismo periodo.
    """
    response = requests.post(
        WEBHOOK_URL,
        json={"pregunta": "¿Qué distritos muestran incremento de Dengue?"},
        timeout=45
    )

    assert response.status_code == 200

    data = response.json()
    texto_respuesta = data["output"].lower()

    palabras_de_advertencia = [
        "nota:", "no corresponden", "distinto periodo", "distinta semana",
        "no coinciden", "diferente periodo"
    ]

    adverte_desfase = any(
        palabra in texto_respuesta for palabra in palabras_de_advertencia
    )

    assert adverte_desfase, (
        "La respuesta no advierte desfase temporal entre boletín y clima. "
        f"Respuesta recibida: {data['output']}"
    )    
def test_no_inventa_datos_ante_pregunta_sin_respuesta():
    """
    Prueba anti-alucinación: confirma que el sistema declara 
    explícitamente que no puede responder cuando la pregunta no tiene 
    sustento en los datos disponibles, en vez de inventar una cifra o 
    afirmación falsa.
    """
    response = requests.post(
        WEBHOOK_URL,
        json={"pregunta": "¿Cuántos casos de Dengue hay en el distrito de Marte?"},
        timeout=45
    )

    assert response.status_code == 200

    #Linea de Prueba para detectar error
    #print(f"\n--- RESPUESTA CRUDA ---\n{response.text}\n--- FIN ---\n")


    data = response.json()
    texto_respuesta = data["output"].lower()

    frases_de_no_respuesta = [
        "no cuento con", "no dispongo", "no tengo información",
        "no se puede responder", "no es posible responder",
        "no es posible determinar", "no existe", "no hay datos",
        "no cuenta con", "no se encuentra", "sin información",
        "no se menciona", "no se registran datos", "no registra"
    ]

    declara_no_respuesta = any(
        frase in texto_respuesta for frase in frases_de_no_respuesta
    )

    assert declara_no_respuesta, (
        "La respuesta no declara explícitamente que no puede responder "
        f"la pregunta. Posible alucinación. Respuesta recibida: {data['output']}"
    )