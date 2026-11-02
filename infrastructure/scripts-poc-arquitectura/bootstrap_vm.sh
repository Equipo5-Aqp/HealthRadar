#!/usr/bin/env bash
# ==============================================================================
# Bootstrap de una VM nueva de HealthRadar desde cero — ADR-015
# Proyecto: HealthRadar
#
# Proposito:
#   Convierte un Ubuntu 24.04 recien instalado en el host de produccion:
#   swap -> Docker -> .env -> build -> restore del ultimo backup -> cron de backups.
#   Lo ejecuta cloud-init en la VM de recuperacion creada por Terraform
#   (infrastructure/terraform/cloud-init.yaml.tftpl). Idempotente: re-ejecutarlo
#   no vuelve a restaurar ni duplica el cron.
#
# Modos:
#   Azure (cloud-init): .env desde Key Vault y dump desde Blob con la identidad
#     administrada. Variables: HR_KEY_VAULT, HR_ENV_SECRET, BACKUP_STORAGE_ACCOUNT,
#     BACKUP_STORAGE_CONTAINER.
#   Local (VMware, sin Azure): --env-file <ruta> --dump <archivo.dump.gz>
#
# Uso:
#   sudo bash bootstrap_vm.sh                                     # modo Azure
#   sudo bash bootstrap_vm.sh --env-file ~/.env --dump ~/pg_2026-W42.dump.gz
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
INFRA_DIR="$REPO_DIR/infrastructure"
COMPOSE=(docker compose -f "$INFRA_DIR/docker-compose.yml")
STATE_DIR="/var/lib/healthradar"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
fail() { log "[ERROR] $*"; exit 1; }

ENV_FILE=""
DUMP=""
while [ $# -gt 0 ]; do
  case "$1" in
    --env-file) ENV_FILE="${2:?--env-file requiere una ruta}"; shift ;;
    --dump) DUMP="${2:?--dump requiere una ruta}"; shift ;;
    -h|--help) sed -n '2,23p' "$0"; exit 0 ;;
    *) fail "Argumento desconocido: $1" ;;
  esac
  shift
done

[ "$(id -u)" -eq 0 ] || fail "Ejecutar con sudo."
# Dueno del repo = usuario que opera la VM (azureuser en Azure, tu usuario en VMware)
APP_USER="${APP_USER:-$(stat -c %U "$REPO_DIR")}"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
mkdir -p "$STATE_DIR"

echo ""
echo "======================================================================"
echo "  HEALTHRADAR - Bootstrap de VM desde cero (ADR-015)"
echo "  Repo: $REPO_DIR | Usuario: $APP_USER"
echo "======================================================================"
echo ""

# 1. Swap de 4 GB antes de compilar (HU-304, anti-OOM en 4 GiB de RAM)
log "[1/6] Swap..."
bash "$SCRIPT_DIR/setup_swap_azure_vm.sh"
# Hora de Lima: el cron de backups (viernes 20:00) se interpreta con la zona del sistema.
timedatectl set-timezone America/Lima || log " -> Aviso: no se pudo fijar la zona horaria."

# 2. Docker Engine + Compose v2 (repositorio oficial, mismos pasos que setup_azure_vm.sh)
log "[2/6] Docker..."
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg python3
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
usermod -aG docker "$APP_USER"
log " -> $(docker --version)"

# 3. infrastructure/.env (credenciales originales; nunca .env.example vacio)
log "[3/6] Variables de entorno..."
descargar_env() {
  kv_get_secret "$HR_KEY_VAULT" "${HR_ENV_SECRET:-healthradar-env}" > "$1"
}
if [ -n "$ENV_FILE" ]; then
  [ -f "$ENV_FILE" ] || fail "No existe $ENV_FILE."
  tr -d '\r' < "$ENV_FILE" > "$INFRA_DIR/.env.tmp"
  log " -> .env copiado desde $ENV_FILE."
elif [ -f "$INFRA_DIR/.env" ]; then
  cp "$INFRA_DIR/.env" "$INFRA_DIR/.env.tmp"
  log " -> .env existente conservado."
else
  [ -n "${HR_KEY_VAULT:-}" ] || fail "Sin .env: pasar --env-file o definir HR_KEY_VAULT."
  # shellcheck source=azure_blob.sh
  . "$SCRIPT_DIR/azure_blob.sh"
  con_reintentos 20 descargar_env "$INFRA_DIR/.env.raw" || fail "No se pudo leer el secreto de Key Vault $HR_KEY_VAULT."
  # Un .env subido desde Windows trae CRLF: el \r romperia cada valor.
  tr -d '\r' < "$INFRA_DIR/.env.raw" > "$INFRA_DIR/.env.tmp"
  rm -f "$INFRA_DIR/.env.raw"
  log " -> .env descargado de Key Vault $HR_KEY_VAULT."
fi
chmod 600 "$INFRA_DIR/.env.tmp"
chown "$APP_USER": "$INFRA_DIR/.env.tmp"
mv -f "$INFRA_DIR/.env.tmp" "$INFRA_DIR/.env"
"${COMPOSE[@]}" config -q || fail "docker compose config fallo: al .env le faltan variables."

# 4. Build secuencial, igual que deploy.yml (ADR-008: proteger los 4 GiB)
log "[4/6] Compilando imagenes (una a la vez)..."
for servicio in n8n mf-dashboard mf-consulta mf-historicos; do
  log " -> $servicio"
  "${COMPOSE[@]}" build "$servicio"
done

# 5. Restore (una sola vez por VM)
log "[5/6] Datos..."
if [ -f "$STATE_DIR/restore.done" ]; then
  # restore_healthradar.sh deja la marca apenas verifica los datos: si fallo despues
  # (migraciones o arranque), aqui se completan esos pasos sin volver a restaurar.
  log " -> Restore ya realizado el $(cat "$STATE_DIR/restore.done"); se completan migraciones y arranque."
  "${COMPOSE[@]}" up -d --wait --wait-timeout 180 postgres
  bash "$SCRIPT_DIR/migrate.sh"
  "${COMPOSE[@]}" up -d --wait --wait-timeout 600
elif [ -n "$DUMP" ] || [ -n "${BACKUP_STORAGE_ACCOUNT:-}" ]; then
  if [ -n "$DUMP" ]; then
    RESTORE_MARKER="$STATE_DIR/restore.done" bash "$SCRIPT_DIR/restore_healthradar.sh" "$DUMP"
  else
    RESTORE_MARKER="$STATE_DIR/restore.done" bash "$SCRIPT_DIR/restore_healthradar.sh"
  fi
else
  log " -> [AVISO] Sin backup (ni --dump ni BACKUP_STORAGE_ACCOUNT): instalacion LIMPIA, sin datos."
  "${COMPOSE[@]}" up -d --wait --wait-timeout 180 postgres
  bash "$SCRIPT_DIR/migrate.sh"
  "${COMPOSE[@]}" up -d --wait --wait-timeout 600
fi

# 6. Cron de backups semanal (manual HU-303), con copia off-site si hay Storage
log "[6/6] Cron de backups..."
install -d -m 700 -o "$APP_USER" "$APP_HOME/backups/healthradar"
BACKUP_LOG="$APP_HOME/backups/healthradar/backup.log"
{
  crontab -u "$APP_USER" -l 2>/dev/null \
    | grep -v -e 'backup_healthradar.sh' -e '^TZ=America/Lima' -e '^BACKUP_STORAGE_' || true
  echo "TZ=America/Lima"
  if [ -n "${BACKUP_STORAGE_ACCOUNT:-}" ]; then
    echo "BACKUP_STORAGE_ACCOUNT=$BACKUP_STORAGE_ACCOUNT"
    echo "BACKUP_STORAGE_CONTAINER=${BACKUP_STORAGE_CONTAINER:-backups}"
  fi
  echo "0 20 * * 5 $SCRIPT_DIR/backup_healthradar.sh >> $BACKUP_LOG 2>&1"
} | crontab -u "$APP_USER" -
log " -> crontab de $APP_USER actualizado."

echo ""
echo "======================================================================"
echo "  [EXITO] HealthRadar levantado desde cero."
echo "  URL: http://<IP_DE_ESTA_VM>:3000"
echo "======================================================================"
"${COMPOSE[@]}" ps
