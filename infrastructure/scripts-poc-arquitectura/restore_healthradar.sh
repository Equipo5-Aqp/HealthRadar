#!/usr/bin/env bash
# ==============================================================================
# Restore completo de HealthRadar desde un backup de PostgreSQL — ADR-015 / HU-303
# Proyecto: HealthRadar
#
# Proposito:
#   Deja el stack funcionando a partir de un dump de backup_healthradar.sh.
#   Portable: VM de recuperacion en Azure, VM local (VMware), WSL o cualquier
#   host con Docker. Requiere infrastructure/.env con las credenciales ORIGINALES
#   (la misma N8N_ENCRYPTION_KEY; si no, las credenciales de n8n no descifran).
#
# Pasos:
#   1. Obtiene el dump (archivo local o el mas reciente del Blob) y verifica sha256.
#   2. Levanta SOLO postgres: n8n no debe arrancar antes, crearia su esquema y
#      chocaria con el dump (n8n vive en la misma BD, ver backup_healthradar.sh).
#   3. pg_restore. Aborta si la BD ya tiene tablas, salvo --force.
#   4. migrate.sh (la tabla de control viene en el dump: solo aplica las nuevas).
#   5. Levanta el stack completo y prueba http://127.0.0.1:3000/healthz.
#
# Uso:
#   ./restore_healthradar.sh pg_2026-W42.dump.gz      # dump local (.sha256 al lado, opcional)
#   ./restore_healthradar.sh                          # ultimo dump del Blob (BACKUP_STORAGE_ACCOUNT)
#   ./restore_healthradar.sh --force <dump>           # sobrescribe una BD con datos
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PG_CONTAINER="${PG_CONTAINER:-healthradar-postgres}"
COMPOSE=(docker compose -f "$INFRA_DIR/docker-compose.yml")

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
fail() { log "[ERROR] $*"; exit 1; }

FORCE=0
DUMP=""
while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) DUMP="$1" ;;
  esac
  shift
done

echo ""
echo "======================================================================"
echo "  HEALTHRADAR - Restore desde backup (ADR-015 / HU-303)"
echo "======================================================================"
echo ""

command -v docker >/dev/null 2>&1 || fail "docker no disponible en el PATH."
[ -f "$INFRA_DIR/.env" ] || fail "Falta $INFRA_DIR/.env (descargarlo de Key Vault, ver infrastructure/terraform/README.md)."

# 1. Obtener el dump
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

if [ -z "$DUMP" ]; then
  [ -n "${BACKUP_STORAGE_ACCOUNT:-}" ] || fail "Pasar un archivo .dump.gz o definir BACKUP_STORAGE_ACCOUNT."
  # shellcheck source=azure_blob.sh
  . "$SCRIPT_DIR/azure_blob.sh"
  log "[1/5] Buscando el ultimo backup en $BACKUP_STORAGE_ACCOUNT/${BACKUP_STORAGE_CONTAINER:-backups}..."
  NAME=""
  for intento in $(seq 1 20); do
    NAME="$(blob_latest "pg_" ".dump.gz" || true)"
    [ -n "$NAME" ] && break
    log "   (intento $intento/20 sin resultado; reintento en 30 s)"
    sleep 30
  done
  [ -n "$NAME" ] || fail "No se encontro ningun pg_*.dump.gz en el Storage (o la VM no tiene permiso)."
  con_reintentos 5 blob_get "$NAME" "$WORK_DIR/$NAME" || fail "No se pudo descargar $NAME."
  blob_get "$NAME.sha256" "$WORK_DIR/$NAME.sha256" || log " -> Aviso: $NAME.sha256 no existe en el Storage."
  DUMP="$WORK_DIR/$NAME"
  log " -> Descargado: $NAME ($(du -h "$DUMP" | cut -f1))."
else
  [ -f "$DUMP" ] || fail "No existe el archivo $DUMP."
  log "[1/5] Usando dump local: $DUMP ($(du -h "$DUMP" | cut -f1))."
fi

# El .sha256 guarda la ruta absoluta de la VM de origen: se compara solo el hash.
if [ -f "$DUMP.sha256" ]; then
  ESPERADO="$(cut -d' ' -f1 "$DUMP.sha256")"
  ACTUAL="$(sha256sum "$DUMP" | cut -d' ' -f1)"
  [ "$ESPERADO" = "$ACTUAL" ] || fail "sha256 no coincide: el dump esta corrupto o incompleto."
  log " -> sha256 OK."
else
  log " -> Aviso: sin $DUMP.sha256, se omite la verificacion de integridad."
fi
gzip -t "$DUMP" || fail "El archivo no es un gzip valido."

# 2. Solo postgres
log "[2/5] Levantando solo PostgreSQL..."
"${COMPOSE[@]}" up -d --wait --wait-timeout 180 postgres

psql_db() {
  docker exec -i "$PG_CONTAINER" sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' -- "$@"
}

TABLAS="$(psql_db -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema');")"
if [ "$TABLAS" != "0" ]; then
  if [ "$FORCE" -ne 1 ]; then
    fail "La BD ya tiene $TABLAS tablas. Para sobrescribirla, repetir con --force."
  fi
  log " -> --force: deteniendo servicios que usan la BD antes de sobrescribir $TABLAS tablas."
  "${COMPOSE[@]}" stop nginx-shell mf-dashboard mf-consulta mf-historicos phoenix n8n
fi

# 3. pg_restore (misma logica que la seccion 3 del manual HU-303)
log "[3/5] Restaurando dump (puede tardar varios minutos)..."
if ! gunzip -c "$DUMP" | docker exec -i "$PG_CONTAINER" sh -c \
    'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; then
  # pg_restore sale con 1 tambien por avisos benignos (p. ej. objetos ya existentes):
  # el criterio real de exito es la verificacion de abajo.
  log " -> pg_restore reporto avisos; verificando el resultado..."
fi

MIGRACIONES="$(psql_db -tAc "SELECT CASE WHEN to_regclass('public.healthradar_schema_migrations') IS NULL THEN 0 ELSE (SELECT count(*) FROM healthradar_schema_migrations) END;")"
[ "$MIGRACIONES" -gt 0 ] || fail "El restore no dejo la tabla healthradar_schema_migrations: revisar los errores de pg_restore."
WORKFLOWS="$(psql_db -tAc "SELECT CASE WHEN to_regclass('public.workflow_entity') IS NULL THEN 0 ELSE (SELECT count(*) FROM workflow_entity) END;")"
log " -> OK: $MIGRACIONES migraciones registradas, $WORKFLOWS workflows de n8n."

# 4. Migraciones posteriores al backup
log "[4/5] Aplicando migraciones nuevas..."
bash "$SCRIPT_DIR/migrate.sh"

# 5. Stack completo + prueba de humo
log "[5/5] Levantando el stack completo (n8n tarda ~2 min en arranque en frio)..."
"${COMPOSE[@]}" up -d --wait --wait-timeout 600

for intento in $(seq 1 10); do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/healthz; then
    break
  fi
  [ "$intento" -lt 10 ] || fail "nginx-shell no responde en http://127.0.0.1:3000/healthz."
  sleep 10
done

echo ""
echo "======================================================================"
echo "  [EXITO] Restore completado: $(basename "$DUMP")"
echo "  $MIGRACIONES migraciones | $WORKFLOWS workflows n8n | http://<IP>:3000"
echo "======================================================================"
"${COMPOSE[@]}" ps
