"""Snapshot del backlog de Fase B (HU-24). Solo lectura."""
import os
import psycopg2
from datetime import datetime, timezone

conn = psycopg2.connect(
    host=os.environ.get("HEALTHRADAR_DB_HOST", "localhost"),
    port=int(os.environ.get("HEALTHRADAR_DB_PORT", 5433)),
    dbname=os.environ.get("HEALTHRADAR_DB_NAME", "healthradar_db"),
    user=os.environ.get("HEALTHRADAR_DB_USER", "healthradar_admin"),
    password=os.environ["HEALTHRADAR_DB_PASSWORD"],
)
cur = conn.cursor()
print("Momento (UTC):", datetime.now(timezone.utc).isoformat(timespec="seconds"))
cur.execute("SELECT procesado, COUNT(*) FROM boletin_descubierto GROUP BY procesado ORDER BY procesado;")
for procesado, n in cur.fetchall():
    print(f"procesado={procesado}: {n}")
conn.close()
