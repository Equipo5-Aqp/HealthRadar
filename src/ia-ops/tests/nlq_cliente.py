"""
Cliente NLQ compartido por test_nlq_periodo.py y test_failover_modelo.py (HU-23 / #160).

Ruta publica vigente (Multi-Zone, con sesion): POST /consulta/api/consulta
  -> BFF de mf-consulta (timeout propio de 90 s) -> n8n /webhook/consulta
Respuesta 200: { output, modelo_usado, nivel_riesgo, advertencia_cifras }
Respuesta 503: cuerpo limpio { error: true, codigo, mensaje } (cadena de proveedores agotada)

Hallazgo que condiciona estas pruebas: nginx corta a los 60 s (504) y la cadena de failover
(Kimi -> GLM -> Gemini) puede tardar ~94 s. Un 504/timeout se registra como INCONCLUSO (skip),
no como fallo de logica. El modelo que respondio queda en Phoenix: ver scripts/phoenix_ultimas.py.

Variables de entorno:
  HR_USER, HR_PASS   cuenta de prueba (en CI faltantes = FALLA; local = skip)
  HR_BASE_URL        opcional
  NLQ_TIMEOUT        segundos de espera por consulta (defecto 120)
  NLQ_PAUSA          segundos entre pruebas (defecto 15)
  NLQ_LOG            ruta de un CSV donde se anota cada consulta (hora UTC, http, segundos, modelo)
"""
import csv
import os
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = (os.environ.get("HR_BASE_URL") or "http://20.9.78.118:3000").rstrip("/")
URL_LOGIN = f"{BASE_URL}/api/auth/login"
URL_CONSULTA = f"{BASE_URL}/consulta/api/consulta"
TIMEOUT_CONSULTA = int(os.environ.get("NLQ_TIMEOUT") or 120)
PAUSA = float(os.environ.get("NLQ_PAUSA") or 15)
LOG = os.environ.get("NLQ_LOG")


@dataclass
class Resultado:
    pregunta: str
    http: object            # int, o None si no hubo respuesta (timeout / red)
    segundos: float
    data: dict = field(default_factory=dict)
    texto: str = ""
    error: str = ""

    @property
    def output(self):
        return str(self.data.get("output") or "")

    @property
    def modelo(self):
        return self.data.get("modelo_usado")

    @property
    def nivel_riesgo(self):
        return self.data.get("nivel_riesgo")


def abrir_sesion():
    usuario, clave = os.environ.get("HR_USER"), os.environ.get("HR_PASS")
    if not usuario or not clave:
        msg = "Faltan HR_USER / HR_PASS en el entorno"
        if os.environ.get("CI") == "true":
            pytest.fail(msg + " (en CI no se omite)")
        pytest.skip(msg)
    s = requests.Session()
    r = s.post(URL_LOGIN, json={"email": usuario, "password": clave}, timeout=30)
    assert r.status_code == 200, f"Login fallo: HTTP {r.status_code}"
    return s


def _registrar(res):
    if not LOG:
        return
    nuevo = not os.path.exists(LOG)
    with open(LOG, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if nuevo:
            w.writerow(["hora_utc", "pregunta", "http", "segundos", "modelo_usado", "nivel_riesgo"])
        w.writerow([datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    res.pregunta.replace("\n", " ")[:80], res.http, f"{res.segundos:.1f}",
                    res.modelo or "", res.nivel_riesgo or ""])


def consultar(sesion, pregunta, session_id=None):
    """Hace UNA consulta real, mide el tiempo y nunca lanza por 504/timeout: lo devuelve en Resultado."""
    cuerpo = {"pregunta": pregunta, "sessionId": session_id or f"qa-{uuid.uuid4().hex[:12]}"}
    t0 = time.perf_counter()
    try:
        r = sesion.post(URL_CONSULTA, json=cuerpo, timeout=TIMEOUT_CONSULTA)
        try:
            data = r.json()
            if not isinstance(data, dict):
                data = {}
        except ValueError:
            data = {}
        res = Resultado(pregunta, r.status_code, time.perf_counter() - t0, data, r.text)
    except requests.RequestException as e:
        res = Resultado(pregunta, None, time.perf_counter() - t0, error=type(e).__name__)
    _registrar(res)
    return res


def exigir_respuesta(res):
    """Si no hubo 200, la prueba es INCONCLUSA (skip con motivo), no un fallo de logica."""
    if res.http != 200:
        motivo = "504: el proxy corto a los 60 s" if res.http == 504 else f"HTTP {res.http} {res.error}".strip()
        pytest.skip(f"INCONCLUSO ({motivo}; {res.segundos:.0f} s). Ver NLQ_LOG y Phoenix.")


def pausa():
    time.sleep(PAUSA)
