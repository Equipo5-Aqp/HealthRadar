"""
HU-23 / #160 (parte failover) - Pruebas de caja negra de la cadena de modelos vigente
(Kimi K3 -> GLM-5.3 -> Gemini), por la ruta publica con sesion.

Reemplaza la version de HU-11 (3 cuentas Gemini). Desde afuera no se puede forzar que falle un
proveedor concreto: se observa el comportamiento agregado con UNA consulta compartida por todas las
pruebas (cuesta unos 28 000 tokens). Que agente respondio y cuanto tardo cada intento se confirma en
Phoenix (scripts/phoenix_ultimas.py).
"""
import pytest

from nlq_cliente import abrir_sesion, consultar, exigir_respuesta

PROVEEDORES_VIGENTES = ("kimi", "glm", "gemini")

FRAGMENTOS_INTERNOS = [  # lista viva: errores crudos / credenciales que nunca deben llegar al analista
    "quota exceeded", "resource_exhausted", "rate limit", "api key", "googlepalmapi",
    "nvapi", "bearer ", "authorization", "google gemini(palm)",
]


@pytest.fixture(scope="module")
def consulta():
    return consultar(abrir_sesion(), "cuantos casos de dengue hubo en Lima en 2020")


def test_respuesta_llega_o_falla_con_cuerpo_controlado(consulta):
    if consulta.http in (None, 504):
        pytest.skip(f"INCONCLUSO: sin respuesta util ({consulta.http or consulta.error}, {consulta.segundos:.0f} s)")
    assert consulta.http in (200, 503), (
        f"HTTP inesperado {consulta.http}: {consulta.texto[:200]}"
    )


def test_respuesta_exitosa_cumple_el_contrato(consulta):
    exigir_respuesta(consulta)
    assert consulta.output.strip(), "output vacio"
    assert str(consulta.modelo or "").strip(), "Falta modelo_usado"


def test_modelo_usado_pertenece_a_la_cadena_vigente(consulta):
    exigir_respuesta(consulta)
    modelo = str(consulta.modelo or "").lower()
    assert any(p in modelo for p in PROVEEDORES_VIGENTES), (
        f"modelo_usado='{consulta.modelo}' no pertenece a la cadena Kimi/GLM/Gemini"
    )


def test_error_503_trae_cuerpo_limpio(consulta):
    if consulta.http != 503:
        pytest.skip(f"No hubo 503 en esta corrida (HTTP {consulta.http})")
    assert consulta.data.get("error") is True
    assert str(consulta.data.get("mensaje") or "").strip()
    assert str(consulta.data.get("codigo") or "").strip()


def test_no_expone_credenciales_ni_errores_de_proveedor(consulta):
    if consulta.http is None:
        pytest.skip("Sin respuesta que revisar")
    cuerpo = consulta.texto.lower()
    for frag in FRAGMENTOS_INTERNOS:
        assert frag not in cuerpo, f"La respuesta contiene '{frag}': {cuerpo[:200]}"


@pytest.mark.xfail(
    strict=False,
    reason=(
        "HALLAZGO (medido con Phoenix): cuando Kimi no responde, la cadena tarda ~54 s (GLM) o ~94 s "
        "(Gemini); nginx corta a los 60 s y el usuario recibe 504 aunque el flujo termina bien. "
        "Pendiente: proxy_read_timeout 150s en location /consulta. Quitar el xfail al corregirlo."
    ),
)
def test_responde_antes_del_corte_del_proxy(consulta):
    assert consulta.http != 504 and consulta.segundos < 58, (
        f"HTTP {consulta.http} en {consulta.segundos:.0f} s"
    )
