#!/bin/bash
# ==============================================================================
# Script de Configuración de Memoria SWAP de Contingencia en Azure VM
# Proyecto: HealthRadar — Célula 5
# Arquitecto: Bautista Anampa
# Historia de Usuario: HU-304 / ADR-008 (Anti-OOM)
#
# Propósito:
#   Aprovisiona un archivo SWAP de 4 GB en el disco SSD de la VM Azure
#   (Ubuntu 24.04 LTS x64, Standard_B2als_v2 con 4 GiB de RAM física).
#   Actúa como amortiguador de picos de memoria para Docker y n8n,
#   evitando que el kernel de Linux dispare el OOM Killer (error 137).
# ==============================================================================

set -euo pipefail

SWAP_SIZE="4G"
SWAP_FILE="/swapfile"

echo ""
echo "======================================================================"
echo "  HEALTHRADAR - Configuración de Memoria SWAP (4 GB) en Azure VM"
echo "  ADR-008 & HU-304: Respaldo Anti-OOM para Docker Compose"
echo "======================================================================"
echo ""

# 1. Verificar si ya existe Swap activo y mostrar estado
echo "[1/4] Verificando estado actual de memoria y disco..."
free -h
echo ""
df -h /
echo ""

if swapon --show | grep -q "$SWAP_FILE"; then
    echo " -> [INFO] El archivo SWAP ($SWAP_FILE) ya se encuentra activo."
    swapon --show
    echo ""
    echo "No se requieren cambios adicionales."
    exit 0
fi

# Validación de espacio disponible en disco (evita fallar con disco lleno)
ROOT_AVAIL_KB=$(df --output=avail / | tail -1 | tr -d '[:space:]')
SWAP_KB=$((4 * 1024 * 1024)) # 4 GB en KB
MIN_REQUIRED_KB=$((SWAP_KB + 512 * 1024)) # 4.5 GB en KB

if [ "$ROOT_AVAIL_KB" -lt "$MIN_REQUIRED_KB" ]; then
    echo "[ERROR] Espacio insuficiente en partición raíz (/). Se requieren al menos ~4.5 GB libres."
    df -h /
    exit 1
fi
echo " -> Espacio en disco suficiente para aprovisionar 4 GB de SWAP."

# 2. Crear y asegurar el archivo de Swap
echo ""
echo "[2/4] Creando archivo SWAP de $SWAP_SIZE en disco SSD..."
if [ ! -f "$SWAP_FILE" ]; then
    sudo fallocate -l "$SWAP_SIZE" "$SWAP_FILE" || sudo dd if=/dev/zero of="$SWAP_FILE" bs=1M count=4096 status=progress
    sudo chmod 600 "$SWAP_FILE"
    sudo mkswap "$SWAP_FILE"
    echo " -> Archivo $SWAP_FILE creado y formateado correctamente."
else
    echo " -> Archivo $SWAP_FILE ya existía en disco. Ajustando permisos..."
    sudo chmod 600 "$SWAP_FILE"
fi

# 3. Activar el Swap y persistir en /etc/fstab
echo ""
echo "[3/4] Activando SWAP y configurando persistencia tras reinicios..."
sudo swapon "$SWAP_FILE"

if ! grep -q "$SWAP_FILE" /etc/fstab; then
    echo "$SWAP_FILE none swap sw 0 0" | sudo tee -a /etc/fstab
    echo " -> Añadida entrada persistente en /etc/fstab."
else
    echo " -> Entrada ya presente en /etc/fstab."
fi

# 4. Sintonizar parámetros del Kernel para Anti-OOM (swappiness = 10)
echo ""
echo "[4/4] Sintonizando parámetros de memoria del Kernel..."
# swappiness=10: el kernel solo usa swap cuando la RAM física está al ~90% de uso
sudo sysctl vm.swappiness=10
# vfs_cache_pressure=50: preserva la caché de inodos/dentries en disco
sudo sysctl vm.vfs_cache_pressure=50

# Persistir configuración en /etc/sysctl.d/99-healthradar-swap.conf
cat << 'EOF' | sudo tee /etc/sysctl.d/99-healthradar-swap.conf > /dev/null
# Configuración Anti-OOM para HealthRadar (HU-304 / ADR-008)
vm.swappiness=10
vm.vfs_cache_pressure=50
EOF

echo ""
echo "======================================================================"
echo "  [EXITO] ¡MEMORIA SWAP DE 4 GB CONFIGURADA CORRECTAMENTE!"
echo "======================================================================"
echo ""
echo "Estado final de memoria:"
free -h
echo ""
swapon --show
echo "======================================================================"
