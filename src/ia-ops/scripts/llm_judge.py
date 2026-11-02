"""LLM-as-a-Judge (#155 / HU-18).
Juzga respuestas guardadas del NLQ con la rubrica de evaluator-critic.md y las
compara con el puntaje manual congelado. No toca el sistema en produccion."""
import argparse
import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

AQUI = Path(__file__).parent
RUBRICA = AQUI.parent / "prompts" / "evaluator-critic.md"
RESPUESTAS = AQUI / "respuestas_juez.json"
MANUAL = AQUI / "puntaje_manual_congelado.md"
SALIDA = AQUI / "juez_resultados.json"
HASH_CONGELADO = "DB12B74885F81C932ED54FA03393E59EFF346DD4A134B1534C43573BB93049B0"

MODELO = os.environ.get("JUDGE_MODEL", "gemini-3.5-flash-lite")
PAUSA = int(os.environ.get("JUDGE_PAUSA", "12"))

# Columna "Respuesta esperada" de evaluator-critic.md (sin cambios de fondo).
ESPERADO = {
    1: "Activa prediccion (anio <=2024, departamento detectado). Trae tendencia de Arequipa/dengue y termina con marcador de riesgo.",
    2: "Sin departamento ni anio <=2024: usa boletines recientes, sin marcador de riesgo.",
    3: "Declara explicitamente que no tiene esa informacion (anti-alucinacion).",
    4: "Si boletin y clima son de semanas distintas, advierte el desfase temporal antes de responder.",
    5: "Activa prediccion a nivel nacional; no pide que se especifique un departamento.",
}

SISTEMA = """Eres un evaluador de calidad de respuestas de un asistente de vigilancia epidemiologica.
Aplica EXACTAMENTE esta rubrica (version del equipo):

{rubrica}

Procedimiento obligatorio. Responde cada puerta con SI o NO usando solo el texto de la respuesta y los campos que se te dan. La primera puerta que se cumple define el puntaje:
A. El output esta vacio o muestra un error interno -> 1
B. No cita ninguna cifra, semana ni lugar concreto sacado de datos -> 2
C. Rompe alguna regla de la columna "Respuesta esperada" de ese caso -> 3
D. Omite informacion relevante que el propio texto muestra que tenia -> 4
E. Ninguna de las anteriores -> 5

Reglas:
1. Si dudas entre dos niveles, elige el MAS BAJO.
2. Una regla de "Respuesta esperada" que no se activo en el caso (por ejemplo, desfase temporal cuando boletin y clima son de la misma semana) no cuenta como cumplida ni como violada.
3. Una cifra que el campo advertencia_cifras marca como no respaldada no cuenta como verificada; no puedes darla por correcta.
4. No uses conocimiento externo para confirmar cifras; solo lo que aparece en la respuesta.

Devuelve SOLO un JSON con esta forma exacta:
{{"puerta": "A|B|C|D|E", "puntaje": 1-5, "justificacion": "una o dos frases citando la puerta o regla"}}"""


def hash_archivo(ruta):
    return hashlib.sha256(ruta.read_bytes()).hexdigest().upper()


def leer_manual():
    texto = MANUAL.read_text(encoding="utf-8")
    puntajes = {}
    for m in re.finditer(r"## Caso (\d+).*?\*\*Mi puntaje \(1-5\):\*\*\s*(\d)", texto, re.S):
        puntajes[int(m.group(1))] = int(m.group(2))
    return puntajes


def llamar_juez(sistema, usuario, clave):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODELO}:generateContent"
    cuerpo = {
        "systemInstruction": {"parts": [{"text": sistema}]},
        "contents": [{"role": "user", "parts": [{"text": usuario}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
    }
    cabeceras = {"x-goog-api-key": clave, "Content-Type": "application/json"}
    for intento in range(3):
        r = requests.post(url, json=cuerpo, headers=cabeceras, timeout=90)
        if r.status_code in (429, 500, 502, 503):
            time.sleep(PAUSA * (intento + 1))
            continue
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code}: {r.text[:200]}")
        texto = r.json()["candidates"][0]["content"]["parts"][0]["text"]
        texto = re.sub(r"^```(?:json)?|```$", "", texto.strip(), flags=re.M).strip()
        datos = json.loads(texto)
        if int(datos["puntaje"]) not in range(1, 6):
            raise ValueError(f"puntaje fuera de rango: {datos}")
        return datos
    raise RuntimeError("El juez no respondio tras 3 intentos (limite de cuota o error del servicio)")


def juzgar_todo():
    clave = os.environ.get("JUDGE_API_KEY")
    if not clave:
        raise SystemExit("Falta JUDGE_API_KEY en esta terminal.")
    rubrica = RUBRICA.read_text(encoding="utf-8")
    sistema = SISTEMA.format(rubrica=rubrica)
    casos = json.loads(RESPUESTAS.read_text(encoding="utf-8"))["casos"]
    resultados = []
    for i, c in enumerate(casos):
        if i:
            time.sleep(PAUSA)
        usuario = (
            f"Caso {c['id']}\nPregunta: {c['pregunta']}\n"
            f"Respuesta esperada segun la rubrica: {ESPERADO[c['id']]}\n"
            f"Campo nivel_riesgo: {c['nivel_riesgo']}\n"
            f"Campo advertencia_cifras: {c['advertencia_cifras']}\n\n"
            f"Respuesta del sistema:\n{c['output'] or '(vacia)'}"
        )
        try:
            j = llamar_juez(sistema, usuario, clave)
            resultados.append({"id": c["id"], "puntaje": int(j["puntaje"]),
                               "puerta": j.get("puerta"), "justificacion": j.get("justificacion", ""), "error": ""})
        except Exception as e:  # el caso queda registrado como fallido, no se inventa puntaje
            resultados.append({"id": c["id"], "puntaje": None, "puerta": None,
                               "justificacion": "", "error": str(e)[:200]})
        print(f"Caso {c['id']}: juez={resultados[-1]['puntaje']} ({resultados[-1]['error'] or 'ok'})")
    SALIDA.write_text(json.dumps({
        "fecha_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "modelo_juez": MODELO, "resultados": resultados}, ensure_ascii=False, indent=2), encoding="utf-8")
    return resultados


def comparar(resultados):
    if hash_archivo(MANUAL) != HASH_CONGELADO:
        print("\nATENCION: puntaje_manual_congelado.md NO coincide con el hash registrado. "
              "La comparacion no es valida.")
    else:
        print("\nHash del puntaje manual verificado (archivo sin cambios desde el congelado).")
    manual = leer_manual()
    filas = [(r["id"], manual.get(r["id"]), r["puntaje"], r["puerta"]) for r in resultados]
    print("\nCaso | Manual | Juez | Puerta | Diferencia")
    validos = []
    for cid, m, j, p in filas:
        dif = "" if (m is None or j is None) else str(abs(m - j))
        print(f"{cid}    | {m}      | {j}    | {p}      | {dif}")
        if m is not None and j is not None:
            validos.append(abs(m - j))
    if validos:
        n = len(validos)
        print(f"\nCasos comparados: {n} de {len(filas)}")
        print(f"Acuerdo exacto: {sum(d == 0 for d in validos)}/{n} ({100 * sum(d == 0 for d in validos) / n:.0f}%)")
        print(f"Acuerdo dentro de +-1: {sum(d <= 1 for d in validos)}/{n} ({100 * sum(d <= 1 for d in validos) / n:.0f}%)")
        print(f"Diferencia absoluta media: {sum(validos) / n:.2f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sin-conexion", action="store_true",
                    help="no llama al juez; reutiliza juez_resultados.json y recalcula la comparacion")
    args = ap.parse_args()
    if args.sin_conexion:
        res = json.loads(SALIDA.read_text(encoding="utf-8"))["resultados"]
    else:
        res = juzgar_todo()
    comparar(res)
    for r in res:
        print(f"\nCaso {r['id']} - puerta {r['puerta']}: {r['justificacion']}")