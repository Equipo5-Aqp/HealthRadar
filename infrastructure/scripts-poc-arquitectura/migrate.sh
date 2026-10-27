#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$ROOT_DIR/src/database/migrations}"
DB_CONTAINER="${DB_CONTAINER:-healthradar-postgres}"

if ! docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
  echo "ERROR: no existe el contenedor '$DB_CONTAINER'. Levanta el stack con 'docker compose up -d'." >&2
  exit 1
fi

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "ERROR: no existe el directorio de migraciones '$MIGRATIONS_DIR'." >&2
  exit 1
fi

echo "Esperando PostgreSQL..."
for _ in $(seq 1 30); do
  if docker exec "$DB_CONTAINER" pg_isready -q; then
    break
  fi
  sleep 2
done

if ! docker exec "$DB_CONTAINER" pg_isready -q; then
  echo "ERROR: PostgreSQL no respondio despues de 60 segundos." >&2
  exit 1
fi

PG_USER="$(docker exec "$DB_CONTAINER" printenv POSTGRES_USER)"
PG_DB="$(docker exec "$DB_CONTAINER" printenv POSTGRES_DB)"

if [ -z "$PG_USER" ] || [ -z "$PG_DB" ]; then
  echo "ERROR: POSTGRES_USER o POSTGRES_DB no estan definidos en el contenedor." >&2
  exit 1
fi

psql_db() {
  docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$PG_DB" "$@"
}

HAS_FULL_SCHEMA="$(psql_db -tAc "SELECT to_regclass('public.boletin_descubierto') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'boletin_descubierto' AND column_name = 'reproceso_intentos');")"

psql_db -q -c "CREATE TABLE IF NOT EXISTS healthradar_schema_migrations (
  filename   TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);"

CONTROL_COUNT="$(psql_db -tAc "SELECT count(*) FROM healthradar_schema_migrations;")"

if [ "$CONTROL_COUNT" = "0" ] && [ "$HAS_FULL_SCHEMA" = "t" ]; then
  echo "Base existente detectada: registrando migraciones actuales como baseline."
  for file in "$MIGRATIONS_DIR"/*.sql; do
    [ -f "$file" ] || continue
    filename="$(basename "$file")"
    psql_db -q -c "INSERT INTO healthradar_schema_migrations(filename) VALUES ('$filename') ON CONFLICT DO NOTHING;"
  done
  echo "Baseline registrado. No se re-ejecuto ninguna migracion."
  exit 0
fi

applied=0
skipped=0

for file in "$MIGRATIONS_DIR"/*.sql; do
  [ -f "$file" ] || continue
  filename="$(basename "$file")"

  already="$(psql_db -tAc "SELECT 1 FROM healthradar_schema_migrations WHERE filename = '$filename';")"
  if [ "$already" = "1" ]; then
    echo "  omitida: $filename"
    skipped=$((skipped + 1))
    continue
  fi

  echo "  aplicando: $filename"
  {
    printf '\n'
    cat "$file"
    printf "\nINSERT INTO healthradar_schema_migrations(filename) VALUES ('%s');\n" "$filename"
  } | psql_db -q --single-transaction

  applied=$((applied + 1))
done

echo "Migraciones aplicadas: $applied. Omitidas: $skipped."
