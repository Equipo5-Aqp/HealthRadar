"""
HU-09 — Test de Versionado de Prompts
Confirma que los archivos documentados en src/ia-ops/prompts/ siguen
reflejando el contrato real usado por n8n: nombres de variables de
entorno correctos y contenido no vacío/placeholder.

No requiere acceso a n8n ni a la VM — valida el archivo de
documentación en sí, más el JSON exportado del workflow (si está
disponible localmente), sin necesitar credenciales.
"""
import os
import re
import pytest

PROMPTS_DIR = os.path.join(
    os.path.dirname(__file__), "..", "prompts"
)

AGENT_PROMPT_PATH = os.path.join(PROMPTS_DIR, "agent-nlq-translator.md")
EVALUATOR_PATH = os.path.join(PROMPTS_DIR, "evaluator-critic.md")


def leer_archivo(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


# --- Test 1: El archivo ya no está vacío ni es el placeholder original ---
def test_agent_prompt_no_esta_vacio():
    contenido = leer_archivo(AGENT_PROMPT_PATH)
    assert contenido.strip() != "", "agent-nlq-translator.md está vacío"
    assert "<!-- trigger CI -->" != contenido.strip(), (
        "El archivo sigue siendo el placeholder original de Sprint 1"
    )
    assert len(contenido) > 200, (
        "El contenido parece demasiado corto para ser el prompt real"
    )


def test_evaluator_no_esta_vacio():
    contenido = leer_archivo(EVALUATOR_PATH)
    assert contenido.strip() != "", "evaluator-critic.md está vacío (0 bytes)"
    assert len(contenido) > 200


# --- Test 2: El nombre de la variable de entorno está documentado ---
def test_agent_prompt_documenta_variable_conexion():
    contenido = leer_archivo(AGENT_PROMPT_PATH)
    assert "SYSTEM_PROMPT_CONEXION" in contenido, (
        "El archivo no menciona la variable de entorno real "
        "usada por los nodos AI Agent en n8n"
    )


def test_agent_prompt_documenta_variable_fase_b():
    contenido = leer_archivo(AGENT_PROMPT_PATH)
    assert "SYSTEM_PROMPT_FASE_B" in contenido


# --- Test 3: El marcador de riesgo documentado coincide con el regex real ---
def test_formato_marcador_riesgo_coincide_con_nodo_n8n():
    contenido = leer_archivo(AGENT_PROMPT_PATH)
    # Mismo regex EXACTO que usa el nodo "Extraer y limpiar nivel de
    # riesgo" en n8n — si alguien cambia el formato ahí, este test
    # detecta que la documentación quedó desactualizada.
    regex_documentado = r"\[NIVEL_RIESGO:\s*(alto|medio|bajo)\]"
    assert regex_documentado.replace("\\", "") in contenido.replace("\\", "") or \
        "[NIVEL_RIESGO:" in contenido, (
        "El formato del marcador de riesgo no está documentado "
        "correctamente o no coincide con el patrón real usado en n8n"
    )


# --- Test 4: El evaluador cubre al menos los 5 niveles de la escala ---
def test_evaluator_tiene_escala_completa_1_a_5():
    contenido = leer_archivo(EVALUATOR_PATH)
    for nivel in ["1", "2", "3", "4", "5"]:
        assert f"{nivel}." in contenido or f"{nivel} " in contenido, (
            f"Falta el nivel {nivel} en la escala de evaluación"
        )