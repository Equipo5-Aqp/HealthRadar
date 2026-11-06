# shellcheck shell=bash
# ==============================================================================
# Helper (se carga con `source`) para Azure Blob Storage y Key Vault — ADR-015
# Proyecto: HealthRadar
#
# Proposito:
#   Subir/bajar backups y leer el .env usando la identidad administrada de la VM
#   (token del endpoint IMDS 169.254.169.254). Sin az CLI, sin claves de acceso
#   en disco: solo curl + python3 (ya presentes en Ubuntu 24.04).
#
# Variables:
#   BACKUP_STORAGE_ACCOUNT    Storage Account de backups (output storage_account de Terraform)
#   BACKUP_STORAGE_CONTAINER  Contenedor (default: backups)
#
# Funciones:
#   az_token <resource>           token OAuth de la identidad administrada
#   blob_put <archivo> <nombre>   sube un archivo al contenedor
#   blob_get <nombre> <destino>   descarga un blob
#   blob_latest <prefijo> <sufijo> nombre del blob mas reciente (por Last-Modified)
#   kv_get_secret <vault> <nombre> imprime el valor de un secreto de Key Vault
#   con_reintentos <n> <cmd...>   reintenta cada 30 s (RBAC tarda minutos en propagarse)
# ==============================================================================

AZ_IMDS_TOKEN_URL="http://169.254.169.254/metadata/identity/oauth2/token"
AZ_STORAGE_API_VERSION="2021-08-06"
AZ_KEYVAULT_API_VERSION="7.4"

az_token() {
  local resource="$1"
  curl -fsS --retry 3 --retry-delay 5 -G -H "Metadata: true" \
    --data-urlencode "api-version=2018-02-01" \
    --data-urlencode "resource=$resource" \
    "$AZ_IMDS_TOKEN_URL" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])'
}

_blob_base_url() {
  : "${BACKUP_STORAGE_ACCOUNT:?Definir BACKUP_STORAGE_ACCOUNT}"
  echo "https://${BACKUP_STORAGE_ACCOUNT}.blob.core.windows.net/${BACKUP_STORAGE_CONTAINER:-backups}"
}

blob_put() {
  local file="$1" name="$2" token
  token="$(az_token "https://storage.azure.com/")" || return 1
  curl -fsS --retry 3 -X PUT -T "$file" \
    -H "Authorization: Bearer $token" \
    -H "x-ms-version: $AZ_STORAGE_API_VERSION" \
    -H "x-ms-blob-type: BlockBlob" \
    "$(_blob_base_url)/$name" >/dev/null
}

blob_get() {
  local name="$1" dest="$2" token
  token="$(az_token "https://storage.azure.com/")" || return 1
  curl -fsS --retry 3 -o "$dest" \
    -H "Authorization: Bearer $token" \
    -H "x-ms-version: $AZ_STORAGE_API_VERSION" \
    "$(_blob_base_url)/$name"
}

blob_latest() {
  local prefix="$1" suffix="$2" token
  token="$(az_token "https://storage.azure.com/")" || return 1
  curl -fsS --retry 3 -G \
    -H "Authorization: Bearer $token" \
    -H "x-ms-version: $AZ_STORAGE_API_VERSION" \
    --data-urlencode "restype=container" \
    --data-urlencode "comp=list" \
    --data-urlencode "prefix=$prefix" \
    "$(_blob_base_url)" \
    | python3 -c '
import sys, xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
suffix = sys.argv[1]
blobs = []
for b in ET.fromstring(sys.stdin.buffer.read()).iter("Blob"):
    name = b.findtext("Name")
    if name.endswith(suffix):
        blobs.append((parsedate_to_datetime(b.findtext("Properties/Last-Modified")), name))
print(max(blobs)[1] if blobs else "")
' "$suffix"
}

kv_get_secret() {
  local vault="$1" name="$2" token
  token="$(az_token "https://vault.azure.net")" || return 1
  curl -fsS --retry 3 \
    -H "Authorization: Bearer $token" \
    "https://${vault}.vault.azure.net/secrets/${name}?api-version=${AZ_KEYVAULT_API_VERSION}" \
    | python3 -c 'import json,sys; sys.stdout.write(json.load(sys.stdin)["value"])'
}

con_reintentos() {
  local _max="$1" _intento=1
  shift
  until "$@"; do
    if [ "$_intento" -ge "$_max" ]; then
      return 1
    fi
    echo "   (intento $_intento/$_max fallido; reintento en 30 s: los permisos RBAC pueden tardar en propagarse)" >&2
    _intento=$((_intento + 1))
    sleep 30
  done
}
