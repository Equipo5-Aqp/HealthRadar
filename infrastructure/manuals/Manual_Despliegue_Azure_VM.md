# Manual de Despliegue en Microsoft Azure VM — HealthRadar

> **Proyecto:** HealthRadar — Célula 5  
> **Sistema Operativo VM:** Ubuntu Server 24.04 LTS (x64)  
> **Tamaño VM:** `Standard_B2als_v2` (AMD EPYC, 2 vCPUs, 4 GB RAM, 3,750 IOPS)  
> **Relacionado con:** [ADR-009](../ADRs/ADR-009-oci-always-free-hosting.md) · [ADR-008](../ADRs/ADR-008-docker-compose.md)  
> **Última actualización:** 2026-08-21

---

## 1. Contexto y Arquitectura de Despliegue

En cumplimiento con el **[ADR-009](../ADRs/ADR-009-oci-always-free-hosting.md)** (Plan de Contingencia Activado) y el **[ADR-008](../ADRs/ADR-008-docker-compose.md)**, el stack de HealthRadar se despliega en un **host único** en Microsoft Azure mediante Docker Compose sobre una red bridge interna (`healthradar-net`).

### Servicios que componen el host:
1. **`healthradar-postgres`**: PostgreSQL 16 + extensión `pgvector` (Base de datos relacional y vectorial).
2. **`healthradar-n8n`**: Orquestador self-hosted de flujos de IA y Webhooks.
3. **`healthradar-phoenix`**: Arize Phoenix para observabilidad de LLMs y trazas de prompts.
4. **`healthradar-frontend`**: Microfrontend Next.js (único servicio con puerto público `3000` expuesto).

---

## 2. Paso 1 — Abrir el Puerto 3000 (Frontend) en el Firewall de Azure

Antes de levantar el stack, debemos permitir el tráfico entrante al puerto 3000 en el Network Security Group (NSG) de Azure:

1. Ingresa a [portal.azure.com](https://portal.azure.com).
2. Entra a tu máquina virtual **`healthradar-vm`**.
3. En el menú lateral izquierdo, ve a **Configuración** ➔ **Redes** (o *Networking*).
4. Haz clic en el botón **+ Agregar regla de puerto de entrada** (*Add inbound security rule*):
   - **Origen (Source):** `Any`
   - **Intervalos de puertos de destino (Destination port ranges):** `3000`
   - **Protocolo:** `TCP`
   - **Acción:** `Allow`
   - **Prioridad:** `1010`
   - **Nombre:** `Allow-Frontend-3000`
5. Haz clic en **Agregar** (*Add*).

---

## 3. Paso 2 — Conectarse por SSH desde Windows

### Opción A — Usando el Script Automatizado (Recomendado):
Abre PowerShell en la raíz del proyecto y ejecuta:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\infrastructure\scripts-poc-arquitectura\conectar_azure_vm.ps1 -AzurePublicIp "<TU_IP_PUBLICA_AZURE>"
```

### Opción B — Conexión Manual:
```powershell
# 1. Mover la clave descargada
Copy-Item "$HOME\Downloads\healthradar-vm_key.pem" "$HOME\.ssh\healthradar-vm_key.pem" -Force

# 2. Conectar por SSH
ssh -i "$HOME\.ssh\healthradar-vm_key.pem" azureuser@<TU_IP_PUBLICA_AZURE>
```
*(Escribe `yes` cuando te pregunte si confías en el host).*

---

## 4. Paso 3 — Instalación de Docker y Despliegue en la VM

Una vez conectado dentro de la terminal de Ubuntu en Azure, ejecuta los siguientes comandos:

```bash
# 1. Actualizar el sistema e instalar Docker + Docker Compose v2 + Git
sudo apt-get update -y && sudo apt-get upgrade -y
sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER

# 2. Aplicar permisos de grupo
newgrp docker

# 3. Clonar el repositorio
git clone https://github.com/tu-organizacion/Celula5_HealthRadar.git
cd Celula5_HealthRadar/infrastructure

# 4. Configurar variables de entorno y levantar los contenedores
cp .env.example .env
docker compose up -d

# 5. Verificar estado
docker compose ps
```

---

## 5. Paso 4 — Verificación de Servicios

Comprueba el funcionamiento desde tu navegador web:

| Servicio | URL | Estado Esperado |
|---|---|---|
| **Frontend Next.js** | `http://<IP_AZURE>:3000` | Página principal de HealthRadar respondiendo |
| **PostgreSQL + pgvector** | Red interna `postgres:5432` | Estado `healthy` en `docker compose ps` |
| **n8n Self-Hosted** | Red interna `n8n:5678` | Estado `Up` |
| **Arize Phoenix** | Red interna `phoenix:6006` | Estado `Up` |

---

## 6. Comandos Útiles de Mantenimiento en la VM

```bash
# Ver logs de todos los servicios en tiempo real:
docker compose logs -f

# Ver logs de un servicio específico (ej. postgres o n8n):
docker compose logs -f postgres
docker compose logs -f n8n

# Reiniciar todos los servicios:
docker compose restart

# Detener los servicios:
docker compose down
```
