#!/bin/bash
# ==============================================================================
# Script de Aprovisionamiento y Despliegue en Azure VM (Ubuntu 24.04 LTS x64)
# Proyecto: HealthRadar — Célula 5
# Arquitecto: Bautista Anampa
# ==============================================================================

set -e

echo ""
echo "======================================================================"
echo "  HEALTHRADAR - Aprovisionamiento Docker en Microsoft Azure VM"
echo "  VM: Standard_B2als_v2 (AMD EPYC x86_64, 4 GB RAM)"
echo "======================================================================"
echo ""

# 1. Actualización del sistema
echo "[1/5] Actualizando paquetes del sistema..."
sudo apt-get update -y
sudo apt-get upgrade -y

# 2. Instalación de dependencias, Docker Engine y Docker Compose
echo ""
echo "[2/5] Instalando Docker Engine, Docker Compose v2 y Git..."
sudo apt-get install -y ca-certificates curl gnupg lsb-release git ufw

# Instalar repositorio oficial de Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 3. Configurar usuario y permisos
echo ""
echo "[3/5] Configurando permisos de usuario para Docker..."
sudo systemctl enable --now docker
sudo usermod -aG docker $USER

# 4. Clonar o actualizar el repositorio de HealthRadar
echo ""
echo "[4/5] Clonando repositorio de HealthRadar..."
REPO_DIR="$HOME/HealthRadar"

if [ -d "$REPO_DIR" ]; then
    echo " -> Repositorio existente detectado. Actualizando..."
    cd "$REPO_DIR"
    git pull origin main || true
else
    git clone https://github.com/Roberto-Bautista/Celula5_HealthRadar.git "$REPO_DIR" || {
        echo "ERROR: no se pudo clonar el repositorio. Verifica la URL y tus credenciales."
        exit 1
    }
fi

# 5. Despliegue de Contenedores
echo ""
echo "[5/5] Levantando stack con Docker Compose..."
cd "$REPO_DIR/infrastructure"

if [ ! -f ".env" ]; then
    echo " -> Creando .env desde .env.example..."
    cp .env.example .env
fi

sudo docker compose up -d --wait
sudo bash scripts-poc-arquitectura/migrate.sh

echo ""
echo "======================================================================"
echo "  [EXITO] ¡STACK DE HEALTHRADAR DESPLEGADO CORRECTAMENTE EN AZURE!"
echo "======================================================================"
echo ""
sudo docker compose ps
echo ""
echo "Servicios activos:"
echo " - Nginx Shell Router:     http://<IP_PUBLICA_AZURE>:3000"
echo " - PostgreSQL + pgvector:  healthradar-postgres (Interno: 5432)"
echo " - n8n Self-Hosted:        healthradar-n8n (Interno: 5678)"
echo " - Arize Phoenix LLM Obs:  healthradar-phoenix (Interno: 6006)"
echo "======================================================================"
