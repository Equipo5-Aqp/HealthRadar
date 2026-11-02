"""Recolector de respuestas del NLQ para el juez (#155 / HU-18).
Solo llama al endpoint publico; no toca la base de datos."""
import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import requests

ENDPOINT = os.environ.get(
    "N8N_CONSULTA_URL", "http://20.9.78.118:3000/consulta/api/consulta"
)
PAUSA_SEG = int(os.environ.get("PAUSA_ENTRE_PREGUNTAS", "30"))
TIMEOUT_SEG = 120
SALIDA = Path(__file__).parent

# Preguntas fijas: el texto no debe cambiar entre corridas.
PREGUNTAS = [
    {"id": 1, "pregunta": "¿Cuántos casos de dengue hubo en Arequipa en marzo de 2024?"},
    {"id": 2, "pregunta": "¿Qué pasó con el dengue la semana pasada?"},
    {"id": 3, "pregunta": "¿Hay datos de dengue en el distrito de Marte?"},
    {"id": 4, "pregunta": "¿Cómo influye el clima reciente en los casos de dengue del último boletín?"},
    {"id": 5, "pregunta": "¿Cuántos casos de EDA hubo en 2023?"},
]


def consultar(pregunta):
    cuerpo = {"pregunta": pregunta, "sessionId": "qa-juez-" + uuid.uuid4().hex[:12]}
    t0 = time.time()
    try:
        r = requests.post(ENDPOINT, json=cuerpo, timeout=TIMEOUT_SEG)
        crudo = r.content.decode("utf-8", errors="replace")
        try:
            datos = json.loads(crudo)
        except ValueError:
            datos = {}
        return {"http": r.status_code, "segundos": round(time.time() - t0, 1),
                "datos": datos, "crudo": crudo[:500], "error": ""}
    except requests.RequestException as e:
        return {"http": 0, "segundos": round(time.time() - t0, 1),
                "datos": {}, "crudo": "", "error": str(e)[:200]}


def main():
    resultados = []
    for i, p in enumerate(PREGUNTAS):
        if i:
            time.sleep(PAUSA_SEG)
        res = consultar(p["pregunta"])
        if res["http"] != 200 or not res["datos"].get("output"):
            print(f"Caso {p['id']}: sin respuesta util (HTTP {res['http']}). Reintento en {PAUSA_SEG}s")
            time.sleep(PAUSA_SEG)
            res = consultar(p["pregunta"])
        d = res["datos"]
        resultados.append({
            "id": p["id"],
            "pregunta": p["pregunta"],
            "http": res["http"],
            "segundos": res["segundos"],
            "output": d.get("output", ""),
            "nivel_riesgo": d.get("nivel_riesgo"),
            "modelo_usado": d.get("modelo_usado"),
            "proveedor": d.get("proveedor"),
            "agente": d.get("agente"),
            "advertencia_cifras": d.get("advertencia_cifras"),
            "respuesta_cruda_si_falla": "" if d.get("output") else res["crudo"],
            "error": res["error"],
        })
        print(f"Caso {p['id']}: HTTP {res['http']} | {res['segundos']}s | "
              f"modelo={d.get('modelo_usado')} | riesgo={d.get('nivel_riesgo')} | "
              f"caracteres={len(d.get('output', ''))}")

    ahora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    (SALIDA / "respuestas_juez.json").write_text(
        json.dumps({"fecha_utc": ahora, "endpoint": ENDPOINT, "casos": resultados},
                   ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    lineas = ["# Respuestas del NLQ para puntuar (a ciegas)", f"Fecha UTC: {ahora}"]
    for c in resultados:
        lineas += [
            "", f"## Caso {c['id']}", f"**Pregunta:** {c['pregunta']}",
            f"**Modelo:** {c['modelo_usado']} | **nivel_riesgo:** {c['nivel_riesgo']} "
            f"| **advertencia_cifras:** {c['advertencia_cifras']}",
            "", c["output"] or "(sin respuesta)", "",
            "**Mi puntaje (1-5):** ____", "**Por qué:** ____",
        ]
    (SALIDA / "respuestas_para_puntuar.md").write_text("\n".join(lineas), encoding="utf-8")
    print("\nListo: respuestas_juez.json y respuestas_para_puntuar.md en src\\ia-ops\\scripts")


if __name__ == "__main__":
    main()