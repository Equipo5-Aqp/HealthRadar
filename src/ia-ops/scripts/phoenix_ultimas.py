"""Lista las consultas NLQ recientes que Phoenix registro (SOLO LECTURA). Requiere el tunel al 6006.
Uso:  python phoenix_ultimas.py [minutos=30]
Muestra hora UTC, estado, pregunta (60 car.), modelo, proveedor, agente de la cadena y latencia."""
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

URL = os.environ.get("PHOENIX_URL", "http://localhost:6006").rstrip("/")
PROYECTO = os.environ.get("PHOENIX_PROJECT", "default")
minutos = int(sys.argv[1]) if len(sys.argv) > 1 else 30
t0 = (datetime.now(timezone.utc) - timedelta(minutes=minutos)).strftime("%Y-%m-%dT%H:%M:%SZ")
q = urllib.parse.urlencode({"name": "nlq.consulta", "start_time": t0, "limit": 100})
datos = json.load(urllib.request.urlopen(f"{URL}/v1/projects/{PROYECTO}/spans?{q}", timeout=20))


def plano(x, p=""):
    r = {}
    if isinstance(x, dict):
        for k, v in x.items():
            r.update(plano(v, f"{p}{k}."))
    else:
        r[p[:-1]] = x
    return r


filas = sorted(datos["data"], key=lambda s: s["start_time"])
print(f"{'hora UTC':20} {'estado':6} {'agente':6} {'seg':>6}  {'modelo':28} pregunta")
for s in filas:
    a = plano(s.get("attributes", {}))
    lat = a.get("healthradar.latencia_ms")
    seg = f"{float(lat) / 1000:.1f}" if lat is not None else "?"
    print(f"{s['start_time'][:19]:20} {str(s.get('status_code')):6} {str(a.get('healthradar.agente')):6} {seg:>6}  "
          f"{str(a.get('llm.model_name'))[:28]:28} {str(a.get('input.value'))[:60]}")
print(f"\nspans: {len(filas)} (ultimos {minutos} min)")
