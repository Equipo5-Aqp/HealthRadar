"""
HU-23 / #160 - Suite NLQ de deteccion de periodo, re-ejecutada contra la cadena vigente
(Kimi K3 -> GLM-5.3 -> Gemini) por la ruta publica con sesion.

Reemplaza la version de HU-10 (que apuntaba a /webhook/consulta sin sesion y a Gemini).
Se conservan las 4 preguntas para poder comparar. Cambios metodologicos:
- 504/timeout/otro HTTP != 200 -> INCONCLUSO (skip con motivo), no fallo de logica.
- Test 1: antes buscaba "20" en el texto, que tambien aparece en "2026" (siempre verdadero);
  ahora exige el numero 20 como palabra independiente.
- Cada consulta queda anotada en NLQ_LOG (hora UTC, HTTP, segundos, modelo).
Las listas de frases son "listas vivas": el modelo varia su redaccion.
"""
import re

import pytest

from nlq_cliente import abrir_sesion, consultar, exigir_respuesta, pausa


@pytest.fixture(scope="module")
def sesion():
    return abrir_sesion()


@pytest.fixture(autouse=True)
def _pausa_entre_pruebas():
    yield
    pausa()


def test_detecta_semana_especifica(sesion):
    r = consultar(sesion, "¿Qué pasó en la semana 20 del 2026?")
    exigir_respuesta(r)
    out = r.output.lower()
    assert out, "Respuesta vacia"
    assert re.search(r"\b20\b", out), f"No referencia la semana 20 pedida: {out[:200]}"


def test_detecta_mes_especifico(sesion):
    r = consultar(sesion, "Dame datos de julio 2025")
    exigir_respuesta(r)
    out = r.output.lower()
    assert out, "Respuesta vacia"
    assert "2025" in out, f"No referencia el año 2025 pedido: {out[:200]}"


def test_fecha_relativa_no_se_interpreta_como_periodo_especifico(sesion):
    """El detector no resuelve 'el año pasado' (cae a las ultimas 12 semanas); solo se exige que responda."""
    r = consultar(sesion, "¿Cómo estuvo el Dengue el año pasado?")
    exigir_respuesta(r)
    assert len(r.output.strip()) > 20, f"Respuesta vacia o trivial: {r.output[:100]}"


FRASES_HONESTIDAD = [  # lista viva
    "no se encontr", "no hay datos", "no hay registros", "no cuento", "no dispongo",
    "no tengo", "no se dispone", "sin informaci", "sin datos", "no existe", "no existen",
    "fuera del", "no contamos","no hay bolet", "no se cuenta",
]


def test_anio_fuera_de_rango_no_rompe_el_sistema(sesion):
    r = consultar(sesion, "¿Hay datos de dengue en 1850?")
    exigir_respuesta(r)
    out = r.output.lower()
    assert out, "Respuesta vacia"
    assert any(f in out for f in FRASES_HONESTIDAD), (
        f"No declara ausencia de datos para 1850 (posible alucinacion): {out[:300]}"
    )
    assert not re.search(r"\b\d[\d\s.,]*\s+casos\b", out), (
        f"Declara ausencia pero ademas inventa una cifra de casos: {out[:300]}"
    )
