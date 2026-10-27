#!/bin/bash
# ==============================================================================
# Script de Backups periodicos de PostgreSQL + flujos de n8n
# Proyecto: HealthRadar
# Historia de Usuario: HU-303 / ADR-002 (backups unicos con pg_dump) / ADR-008
#
# Proposito:
#   Respaldo semanal (cron: viernes 20:00 America/Lima) de:
#     1. PostgreSQL completo en formato custom comprimido (pg_dump -Fc).
#        n8n usa la misma BD que los datos epidemiologicos
#        (infrastructure/docker-compose.yml: DB_POSTGRESDB_DATABASE=${POSTGRES_DB}),
#        por lo que este dump YA incluye workflows, credenciales (cifradas con
#        N8N_ENCRYPTION_KEY) y ejecuciones de n8n.
#     2. Export legible de los flujos n8n (n8n export:workflow --all) en tar.gz,
#        para restore selectivo sin tocar el resto de la BD.
#
# Restricciones respetadas:
#   - 0 MB de RAM permanente: no crea contenedores (prohibido por AGENTS.md
#     salvo aprobacion del Arquitecto); solo hace `docker exec` efimeros sobre
#     postgres y n8n ya existentes. pg_dump corre con nice/ionice porque las
#     20:00 puede haber actividad de usuarios.
#   - Seguridad (ADR-004/ADR-008): sin puertos nuevos, sin credenciales
#     hardcodeadas (se leen del entorno de los contenedores), archivos 600.
#   - Disco: retencion de 2 copias por tipo; al aparecer la 3ra se elimina la
#     mas antigua (exigencia HU-303: ~5.7 GB libres en la VM).
#
# Uso:
#   ./backup_healthradar.sh                      # corrida de backup (cron o manual)
#   BACKUP_DIR=/ruta BACKUP_RETENTION_COUNT=2 ./backup_healthradar.sh
#
# Cron en la VM (crontab -e de azureuser):
#   TZ=America/Lima
#   0 20 * * 5 /home/azureuser/HealthRadar/infrastructure/scripts-poc-arquitectura/backup_healthradar.sh >> /home/azureuser/backups/healthradar/backup.log 2>&1
# ==============================================================================

set -euo pipefail

# --- Configuracion (sobrescribible por entorno; ver infrastructure/.env.example)
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/healthradar}"
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-2}"
PG_CONTAINER="${PG_CONTAINER:-healthradar-postgres}"
N8N_CONTAINER="${N8N_CONTAINER:-healthradar-n8n}"
MIN_FREE_KB=$((1 * 1024 * 1024)) # 1 GB minimo libre para operar con seguridad
LOG_FILE="$BACKUP_DIR/backup.log"

STAMP="$(date +%Y-W%V)" # etiqueta semanal: re-corridas en la misma semana sobrescriben
PG_FILE="$BACKUP_DIR/pg_${STAMP}.dump.gz"
N8N_FILE="$BACKUP_DIR/n8n-workflows_${STAMP}.tar.gz"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

echo ""
echo "======================================================================"
echo "  HEALTHRADAR - Backup semanal PostgreSQL + flujos n8n (HU-303)"
echo "  Destino: $BACKUP_DIR | Retencion: $BACKUP_RETENTION_COUNT copias"
echo "======================================================================"
echo ""

# 1. Directorio de destino con permisos estrictos (seguridad: solo el dueno lee)
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
touch "$LOG_FILE"
chmod 600 "$LOG_FILE" 2>/dev/null || true

# 2. Pre-condiciones: docker + contenedores en marcha + espacio libre
command -v docker >/dev/null 2>&1 || { log "[ERROR] docker no disponible en el PATH."; exit 1; }

for c in "$PG_CONTAINER" "$N8N_CONTAINER"; do
  if [ "$(docker inspect --format '{{.State.Status}}' "$c" 2>/dev/null || echo missing)" != "running" ]; then
    log "[ERROR] El contenedor $c no esta corriendo. Backup abortado (no se deja media copia)."
    exit 1
  fi
done

FREE_KB=$(df --output=avail "$BACKUP_DIR" | tail -1 | tr -d '[:space:]')
if [ "$FREE_KB" -lt "$MIN_FREE_KB" ]; then
  log "[ERROR] Espacio libre insuficiente ($(($FREE_KB / 1024)) MB < 1024 MB). Backup abortado."
  exit 1
fi
log " -> Pre-condiciones OK (contenedores running, libre: $(($FREE_KB / 1024)) MB)."

# 3. Credenciales SOLO desde el entorno del contenedor (nunca hardcodeadas en git)
PG_USER="$(docker exec "$PG_CONTAINER" printenv POSTGRES_USER)"
PG_DB="$(docker exec "$PG_CONTAINER" printenv POSTGRES_DB)"
if [ -z "$PG_USER" ] || [ -z "$PG_DB" ]; then
  log "[ERROR] No se pudieron leer POSTGRES_USER/POSTGRES_DB del contenedor."
  exit 1
fi

# 4. Dump de PostgreSQL (formato custom + gzip). nice/ionice: backup no prioritario.
log "[1/3] pg_dump de $PG_DB (incluye datos + n8n: misma BD)..."
nice -n 10 ionice -c2 -n7 \
  docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc \
  | gzip > "$PG_FILE.tmp"
chmod 600 "$PG_FILE.tmp"
mv -f "$PG_FILE.tmp" "$PG_FILE"
log " -> OK: $(basename "$PG_FILE") ($(du -h "$PG_FILE" | cut -f1))."

# 5. Export de flujos n8n (complemento legible para restore selectivo)
log "[2/3] Export de workflows n8n..."
TMP_EXPORT="$(mktemp -d)"
docker exec "$N8N_CONTAINER" sh -c 'rm -rf /tmp/n8n-export && mkdir -p /tmp/n8n-export'
docker exec "$N8N_CONTAINER" n8n export:workflow --all --output=/tmp/n8n-export/ >/dev/null
docker cp "$N8N_CONTAINER":/tmp/n8n-export/. "$TMP_EXPORT"/
docker exec "$N8N_CONTAINER" sh -c 'rm -rf /tmp/n8n-export' || true
N_COUNT=$(ls -1 "$TMP_EXPORT" | wc -l | tr -d '[:space:]')
tar -czf "$N8N_FILE.tmp" -C "$TMP_EXPORT" .
chmod 600 "$N8N_FILE.tmp"
mv -f "$N8N_FILE.tmp" "$N8N_FILE"
rm -rf "$TMP_EXPORT"
log " -> OK: $(basename "$N8N_FILE") con $N_COUNT flujos ($(du -h "$N8N_FILE" | cut -f1))."

# 6. Checksums de integridad junto a cada artefacto
sha256sum "$PG_FILE" > "$PG_FILE.sha256"
sha256sum "$N8N_FILE" > "$N8N_FILE.sha256"
chmod 600 "$PG_FILE.sha256" "$N8N_FILE.sha256"

# 7. Rotacion: conservar solo las N copias mas recientes por tipo.
#    Al llegar la 3ra (con N=2), la mas antigua se elimina -> disco acotado.
log "[3/3] Rotacion (retencion: $BACKUP_RETENTION_COUNT)..."
rotate() {
  local pattern="$1" keep="$2" f
  local total=0
  while IFS= read -r -d '' f; do
    total=$((total + 1))
    if [ "$total" -gt "$keep" ]; then
      rm -f "$f" "$f.sha256"
      log " -> Eliminado por rotacion: $(basename "$f")"
    fi
  done < <(
    find "$BACKUP_DIR" -maxdepth 1 -type f -name "$pattern" -printf '%T@ %p\0' 2>/dev/null \
      | sort -z -rn \
      | cut -z -d' ' -f2-
  )
}
rotate "pg_*.dump.gz" "$BACKUP_RETENTION_COUNT"
rotate "n8n-workflows_*.tar.gz" "$BACKUP_RETENTION_COUNT"

# 8. Podar checksums huerfanos (si su artefacto ya roto) y recortar el log a ~1 MB
find "$BACKUP_DIR" -maxdepth 1 -name '*.sha256' | while read -r s; do
  [ -f "${s%.sha256}" ] || rm -f "$s"
done
if [ "$(stat -c%s "$LOG_FILE" 2>/dev/null || stat -f%z "$LOG_FILE" 2>/dev/null || echo 0)" -gt 1048576 ]; then
  tail -c 1048576 "$LOG_FILE" > "$LOG_FILE.tmp" && mv -f "$LOG_FILE.tmp" "$LOG_FILE"
fi

echo ""
echo "======================================================================"
echo "  [EXITO] Backup semanal completado."
echo "  Archivos en $BACKUP_DIR:"
ls -1lh "$BACKUP_DIR" | tail -n +2
echo "  Libre tras backup: $(( $(df --output=avail "$BACKUP_DIR" | tail -1 | tr -d '[:space:]') / 1024 )) MB"
echo "======================================================================"
