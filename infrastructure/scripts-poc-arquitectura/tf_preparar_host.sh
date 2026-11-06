#!/usr/bin/env bash
# ==============================================================================
# Preparar un Ubuntu cualquiera para restaurar HealthRadar — ADR-015 / HU-303
# Proyecto: HealthRadar
#
# Proposito:
#   Fase 1 de 2 de la recuperacion en un host fuera de Azure (Ubuntu en VMware,
#   Ubuntu en WSL de Windows, servidor propio). Deja listo tf_bootstrap_vm.sh:
#     1. Revisa el host (Ubuntu, RAM, disco) y muestra su IP.
#     2. Instala git, curl, tmux y Azure CLI (repositorio oficial de Microsoft).
#     3. Login con codigo (az login --use-device-code): cada persona entra con
#        SU cuenta en el navegador de su laptop. Nadie comparte credenciales.
#     4. Descarga el .env del Key Vault -> infrastructure/.env (600, sin CRLF).
#     5. Descarga el ultimo pg_*.dump.gz + .sha256 del Storage y verifica el hash.
#   La sesion de Azure vive en una carpeta temporal que se borra al terminar:
#   no queda ningun token en el host.
#
#   Fase 2 (larga, dentro de tmux): sudo bash tf_bootstrap_vm.sh --dump <ruta>
#
# Permisos de la cuenta (infrastructure/terraform/rbac.tf):
#   Key Vault Secrets User + Storage Blob Data Reader (variable operadores_lectura).
#
# Uso (como usuario normal, SIN sudo; pide la clave de sudo solo para instalar):
#   bash tf_preparar_host.sh --sufijo ch1n1t0
#   bash tf_preparar_host.sh --key-vault <vault> --storage <cuenta> [--tenant usmp.pe]
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
INFRA_DIR="$REPO_DIR/infrastructure"
ENV_SECRET="${HR_ENV_SECRET:-healthradar-env}"
CONTAINER="${BACKUP_STORAGE_CONTAINER:-backups}"
BACKUP_HOME="$HOME/backups/healthradar"
RESTORE_DIR="$BACKUP_HOME/restore"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
fail() { log "[ERROR] $*"; exit 1; }

PREFIJO="healthradar"
SUFIJO=""
KEY_VAULT=""
STORAGE=""
TENANT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --sufijo) SUFIJO="${2:?--sufijo requiere un valor}"; shift ;;
    --prefijo) PREFIJO="${2:?--prefijo requiere un valor}"; shift ;;
    --key-vault) KEY_VAULT="${2:?--key-vault requiere un nombre}"; shift ;;
    --storage) STORAGE="${2:?--storage requiere un nombre}"; shift ;;
    --tenant) TENANT="${2:?--tenant requiere un dominio o ID}"; shift ;;
    -h|--help) sed -n '2,27p' "$0"; exit 0 ;;
    *) fail "Argumento desconocido: $1 (ver --help)" ;;
  esac
  shift
done

# Mismos nombres que infrastructure/terraform/main.tf (locals)
if [ -n "$SUFIJO" ]; then
  KEY_VAULT="${KEY_VAULT:-$PREFIJO-kv-$SUFIJO}"
  STORAGE="${STORAGE:-${PREFIJO}bk$SUFIJO}"
fi
if [ -z "$KEY_VAULT" ] || [ -z "$STORAGE" ]; then
  fail "Indicar --sufijo (o --key-vault y --storage). Ver --help."
fi

[ "$(id -u)" -ne 0 ] || fail "Ejecutar SIN sudo, como el usuario que operara el sistema."
[ -d "$REPO_DIR/.git" ] || fail "$REPO_DIR no es un clon del repositorio."

echo ""
echo "======================================================================"
echo "  HEALTHRADAR - Fase 1/2: preparar el host (ADR-015)"
echo "  Repo: $REPO_DIR | Key Vault: $KEY_VAULT | Storage: $STORAGE"
echo "======================================================================"
echo ""

# 1. Host
log "[1/5] Revisando el host..."
OS_ID="$(. /etc/os-release && echo "${ID:-}")"
OS_VERSION="$(. /etc/os-release && echo "${VERSION_ID:-}")"
[ "$OS_ID" = "ubuntu" ] || fail "Se requiere Ubuntu (24.04 recomendado). Detectado: ${OS_ID:-desconocido}."
[ "$OS_VERSION" = "24.04" ] || log " -> Aviso: probado en Ubuntu 24.04; este host tiene $OS_VERSION."
RAM_MB="$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo)"
[ "$RAM_MB" -ge 3500 ] || log " -> Aviso: ${RAM_MB} MB de RAM; el stack necesita ~3.5 GB (produccion: 4 GiB)."
LIBRE_GB="$(( $(df --output=avail / | tail -1 | tr -d '[:space:]') / 1024 / 1024 ))"
[ "$LIBRE_GB" -ge 15 ] || log " -> Aviso: ${LIBRE_GB} GB libres en /; se recomiendan 15 GB (swap + imagenes + dump)."
IP_HOST="$(hostname -I | awk '{print $1}')"
if grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null; then
  # WSL2: Windows reenvia los puertos de Linux a su propio localhost.
  IP_HOST="localhost"
  # tf_bootstrap_vm.sh instala Docker como servicio de systemd dentro de esta distro.
  [ "$(ps -p 1 -o comm=)" = "systemd" ] \
    || fail "WSL sin systemd. Ejecuta: printf '[boot]\nsystemd=true\n' | sudo tee /etc/wsl.conf ; luego en PowerShell: wsl --shutdown ; y vuelve a abrir Ubuntu."
  if command -v docker >/dev/null 2>&1 && readlink -f "$(command -v docker)" | grep -q docker-desktop; then
    fail "Esta distro usa el Docker de Docker Desktop. Cierra Docker Desktop y desactiva su integracion con esta distro (Settings > Resources > WSL integration)."
  fi
  [ "$RAM_MB" -ge 3500 ] || log " -> En WSL se sube la RAM en %UserProfile%\\.wslconfig ([wsl2] memory=6GB) y luego wsl --shutdown."
fi
log " -> Ubuntu $OS_VERSION | ${RAM_MB} MB RAM | ${LIBRE_GB} GB libres | IP: ${IP_HOST:-sin IP}"
sudo -v || fail "Se necesita la clave de sudo para instalar paquetes."

# 2. Herramientas
log "[2/5] Herramientas (git, curl, tmux, Azure CLI)..."
FALTAN=()
for paquete in git curl tmux python3 ca-certificates gnupg; do
  dpkg -s "$paquete" >/dev/null 2>&1 || FALTAN+=("$paquete")
done
if [ "${#FALTAN[@]}" -gt 0 ]; then
  sudo apt-get update -y
  sudo apt-get install -y "${FALTAN[@]}"
fi
if ! command -v az >/dev/null 2>&1; then
  # Repositorio oficial de Microsoft (mismo patron que Docker en tf_bootstrap_vm.sh)
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://packages.microsoft.com/keys/microsoft.asc \
    | gpg --dearmor | sudo tee /etc/apt/keyrings/microsoft.gpg >/dev/null
  sudo chmod go+r /etc/apt/keyrings/microsoft.gpg
  printf 'Types: deb\nURIs: https://packages.microsoft.com/repos/azure-cli/\nSuites: %s\nComponents: main\nArchitectures: %s\nSigned-by: /etc/apt/keyrings/microsoft.gpg\n' \
    "$(. /etc/os-release && echo "$VERSION_CODENAME")" "$(dpkg --print-architecture)" \
    | sudo tee /etc/apt/sources.list.d/azure-cli.sources >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y azure-cli
fi
log " -> Azure CLI $(az version --query '"azure-cli"' -o tsv)"

# 3. Sesion de Azure aislada: carpeta temporal que se borra al salir (no toca ~/.azure)
log "[3/5] Inicio de sesion en Azure..."
AZURE_CONFIG_DIR="$(mktemp -d)"
TMP_DIR="$(mktemp -d)"
export AZURE_CONFIG_DIR
export AZURE_CORE_COLLECT_TELEMETRY=no
export AZURE_CORE_LOGIN_EXPERIENCE_V2=off # sin selector interactivo de suscripcion
trap 'rm -rf "$AZURE_CONFIG_DIR" "$TMP_DIR"' EXIT

LOGIN_ARGS=(--use-device-code --allow-no-subscriptions --output none)
if [ -n "$TENANT" ]; then
  LOGIN_ARGS+=(--tenant "$TENANT")
fi
echo ""
echo "  Abre en el navegador de TU laptop la direccion que aparece abajo, escribe el"
echo "  codigo y entra con TU cuenta. No uses la cuenta de otra persona."
echo ""
az login "${LOGIN_ARGS[@]}" || fail "az login fallo."
log " -> Sesion iniciada como $(az account show --query user.name -o tsv)."

# 4. .env desde Key Vault
log "[4/5] .env desde el Key Vault $KEY_VAULT..."
az keyvault secret download --vault-name "$KEY_VAULT" --name "$ENV_SECRET" --file "$TMP_DIR/env.raw" \
  || fail "No se pudo leer el secreto $ENV_SECRET. ¿Tu cuenta tiene el rol 'Key Vault Secrets User'? (operadores_lectura en rbac.tf)"
# Un .env subido desde Windows trae CRLF: el \r romperia cada valor.
tr -d '\r' < "$TMP_DIR/env.raw" > "$TMP_DIR/env"

# Obligatorias = las que docker-compose.yml marca con ${VAR:?...}
FALTAN_VARS=""
while IFS= read -r variable; do
  grep -qE "^(export[[:space:]]+)?${variable}=." "$TMP_DIR/env" || FALTAN_VARS="$FALTAN_VARS $variable"
done < <(grep -o '\${[A-Z0-9_]*:?' "$INFRA_DIR/docker-compose.yml" | sed 's/^\${//; s/:?$//' | sort -u)
[ -z "$FALTAN_VARS" ] || fail "Al .env del Key Vault le faltan variables:$FALTAN_VARS"

install -d -m 700 "$BACKUP_HOME"
if [ -f "$INFRA_DIR/.env" ] && ! cmp -s "$TMP_DIR/env" "$INFRA_DIR/.env"; then
  # Fuera del repo: .gitignore solo cubre los archivos llamados exactamente .env
  ANTERIOR="$BACKUP_HOME/env.anterior.$(date +%Y%m%d-%H%M%S)"
  install -m 600 "$INFRA_DIR/.env" "$ANTERIOR"
  log " -> El .env que habia se guardo en $ANTERIOR."
fi
install -m 600 "$TMP_DIR/env" "$INFRA_DIR/.env"
log " -> infrastructure/.env listo (permisos 600)."

# 5. Ultimo backup desde el Storage
log "[5/5] Ultimo backup desde $STORAGE/$CONTAINER..."
BLOB="$(az storage blob list --account-name "$STORAGE" --container-name "$CONTAINER" --auth-mode login \
  --prefix pg_ --query "sort_by([?ends_with(name, '.dump.gz')], &properties.lastModified)[-1].name" -o tsv)" \
  || fail "No se pudo listar el Storage. ¿Tu cuenta tiene el rol 'Storage Blob Data Reader'? (operadores_lectura en rbac.tf)"
[ -n "$BLOB" ] || fail "No hay ningun pg_*.dump.gz en $STORAGE/$CONTAINER."

install -d -m 700 "$RESTORE_DIR"
rm -f "$RESTORE_DIR"/pg_*.dump.gz "$RESTORE_DIR"/pg_*.dump.gz.sha256
for archivo in "$BLOB" "$BLOB.sha256"; do
  az storage blob download --account-name "$STORAGE" --container-name "$CONTAINER" --auth-mode login \
    --name "$archivo" --file "$RESTORE_DIR/$archivo" --no-progress --output none \
    || fail "No se pudo descargar $archivo."
  chmod 600 "$RESTORE_DIR/$archivo"
done

# El .sha256 guarda la ruta de la VM de origen: se compara solo el hash.
ESPERADO="$(cut -d' ' -f1 "$RESTORE_DIR/$BLOB.sha256")"
ACTUAL="$(sha256sum "$RESTORE_DIR/$BLOB" | cut -d' ' -f1)"
[ "$ESPERADO" = "$ACTUAL" ] || fail "sha256 no coincide: el dump se descargo corrupto o incompleto."
log " -> $BLOB ($(du -h "$RESTORE_DIR/$BLOB" | cut -f1)), sha256 OK."

echo ""
echo "======================================================================"
echo "  [LISTO] Fase 1 completada. La sesion de Azure ya se cerro."
echo "  IP de este host: ${IP_HOST:-<ver con hostname -I>}"
echo ""
echo "  Fase 2 (30-40 min). Dentro de tmux, para que siga si se corta el SSH:"
echo "    tmux new -s hr"
echo "    sudo bash $SCRIPT_DIR/tf_bootstrap_vm.sh --dump $RESTORE_DIR/$BLOB"
echo "======================================================================"
