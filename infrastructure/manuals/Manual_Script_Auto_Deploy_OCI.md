# Manual de Usuario: Aprovisionamiento Automático de VM en OCI

> **Proyecto:** HealthRadar — Célula 5  
> **Sistema Operativo:** Windows 10 / 11  
> **Arquitectura VM:** Ampere A1 (ARM64) — 2 OCPUs, 12 GB RAM (*Always Free*)  
> **Última actualización:** 2026-08-19

---

## 1. ¿Por qué existe este script?

Al intentar crear una máquina virtual gratuita en Oracle Cloud Infrastructure (OCI) con el procesador ARM Ampere A1 (`VM.Standard.A1.Flex`), es muy común recibir el mensaje:

> *"Out of capacity for shape VM.Standard.A1.Flex in availability domain AD-1."*

Este error **no indica una mala configuración ni un cobro**. Significa que los servidores físicos de Oracle en la región seleccionada están ocupados en ese instante. Oracle libera cupos de forma aleatoria (cuando otros usuarios eliminan máquinas o se reasignan recursos).

Para no tener que hacer clic manualmente todo el día, este script automatiza la petición cada 30 segundos usando el **OCI CLI** oficial hasta atrapar un cupo disponible.

---

## 2. Requisitos Previos

Antes de iniciar, asegúrate de tener:
- [x] Una cuenta activa en Oracle Cloud.
- [x] La **VCN** (`healthradar-vcn`) y **Subred Pública** (`healthradar-subnet-public`) ya creadas con los puertos abiertos (22, 3000, 5678, 6006).
- [x] Un par de claves SSH en tu PC para entrar a la VM (`$HOME\.ssh\healthradar-oci.pub`).

---

## 3. PARTE 1: Instalación de OCI CLI en Windows

Abre **PowerShell** y ejecuta:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
Invoke-WebRequest https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.ps1 -OutFile $env:TEMP\install.ps1
powershell -ExecutionPolicy Bypass -File $env:TEMP\install.ps1 -AcceptAllDefaults
```

*(Si por alguna razón falla el instalador de PowerShell, puedes instalarlo alternativamente con `pip install oci-cli`).*

Cierra y vuelve a abrir PowerShell para comprobar que funcione:
```powershell
oci --version
```

---

## 4. PARTE 2: Conexión con OCI (Método Directo desde Consola)

Para evitar problemas de formato o discrepancias de llaves, generamos la API Key directamente desde la consola web de Oracle:

### Paso 2.1 — Generar la llave en OCI
1. Entra a la consola web de OCI ([cloud.oracle.com](https://cloud.oracle.com)).
2. Haz clic en el **ícono de tu perfil** (arriba a la derecha) → **"My profile"** (o "User settings").
3. En el menú lateral izquierdo, haz clic en **"API Keys"**.
4. Haz clic en **"Add API Key"**.
5. Selecciona la primera opción: **`Generate API key pair`**.
6. Haz clic en **"Download private key"** (se descargará un archivo `.pem`).
7. Haz clic en **"Add"**.

### Paso 2.2 — Copiar la configuración
Aparecerá una ventana llamada **"Configuration file preview"**. Copia todo su contenido (o haz clic en el botón *Copy*).

### Paso 2.3 — Configurar en tu PC
En PowerShell, movemos la llave descargada y guardamos la configuración **sin caracteres BOM** que puedan romper Python:

```powershell
# 1. Crear carpeta si no existe
New-Item -ItemType Directory -Force -Path "$HOME\.oci" | Out-Null

# 2. Mover la llave privada descargada desde Descargas
$latestPem = Get-ChildItem "$HOME\Downloads\*.pem" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Copy-Item $latestPem.FullName "$HOME\.oci\oci_api_key.pem" -Force

# 3. Guardar el archivo config (Reemplaza con tus datos copiados de OCI si difieren)
$configText = @"
[DEFAULT]
user=TU_USER_OCID
fingerprint=TU_FINGERPRINT
key_file=C:\Users\Usuario\.oci\oci_api_key.pem
tenancy=TU_TENANCY_OCID
region=TU_REGION
"@

# Se guarda en ASCII puro para evitar errores de MissingSectionHeaderError por UTF-8 BOM
[System.IO.File]::WriteAllText("$HOME\.oci\config", $configText, [System.Text.Encoding]::ASCII)
```

### Paso 2.4 — Validar autenticación
```powershell
oci iam region list
```
*(Si devuelve la lista de regiones en JSON, ¡la conexión está 100% lista!).*

---

## 5. PARTE 3: Generación Automática del Script `lanzar_vm.ps1`

En lugar de buscar manualmente los OCIDs de Subred, Imagen, Compartimento y Availability Domain, este bloque consulta la API de Oracle y escribe el script final en tu Escritorio:

```powershell
$tenancyId = (Get-Content $HOME\.oci\config | Select-String "tenancy=").Line.Split("=")[1].Trim()

$ad     = (oci iam availability-domain list --query "data[0].name" --raw-output)
$comp   = $tenancyId
$subnet = (oci network subnet list --compartment-id $comp --query "data[?contains(\`"display-name\`", 'healthradar')].id | [0]" --raw-output)
$img    = (oci compute image list --compartment-id $comp --operating-system "Oracle Linux" --operating-system-version "9" --shape "VM.Standard.A1.Flex" --query "data[?contains(\`"display-name\`", 'aarch64')].id | [0]" --raw-output)

$scriptBody = @"
`$ErrorActionPreference = 'SilentlyContinue'

`$availabilityDomain = "$ad"
`$compartmentId      = "$comp"
`$subnetId           = "$subnet"
`$imageId            = "$img"
`$sshKeyFile         = "`$HOME\.ssh\healthradar-oci.pub"

if (-not (Test-Path `$sshKeyFile)) {
    Write-Host "ERROR: No se encontro la llave SSH en `$sshKeyFile" -ForegroundColor Red
    exit
}

`$vmDisplayName = "healthradar-vm-prod"
`$shape         = "VM.Standard.A1.Flex"
`$shapeConfig   = '{\"ocpus\":2,\"memoryInGBs\":12}'

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  HEALTHRADAR - Buscando capacidad en Oracle Cloud (A1.Flex)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Instancia: `$vmDisplayName"
Write-Host "  Specs:     2 OCPUs, 12 GB RAM (Always Free)"
Write-Host "  Subred:    healthradar-subnet-public"
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "El script reintentara cada 30 segundos. Puedes minimizarlo." -ForegroundColor Yellow
Write-Host ""

`$intento = 1

while (`$true) {
    `$timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[`$timestamp] Intento #`$intento - Solicitando cupo a Oracle..." -ForegroundColor White -NoNewline

    `$resultado = oci compute instance launch `
        --availability-domain `$availabilityDomain `
        --compartment-id `$compartmentId `
        --shape `$shape `
        --shape-config `$shapeConfig `
        --subnet-id `$subnetId `
        --assign-public-ip true `
        --image-id `$imageId `
        --display-name `$vmDisplayName `
        --ssh-authorized-keys-file `$sshKeyFile `
        2>&1 | Out-String

    if (`$resultado -match '"lifecycle-state": "PROVISIONING"' -or `$resultado -match '"id": "ocid1.instance') {
        Write-Host ""
        Write-Host "============================================================" -ForegroundColor Green
        Write-Host "  [EXITO] ¡MAQUINA VIRTUAL CREADA CON EXITO!" -ForegroundColor Green
        Write-Host "============================================================" -ForegroundColor Green
        Write-Host `$resultado
        break
    } elseif (`$resultado -match "capacity" -or `$resultado -match "InternalError" -or `$resultado -match "LimitExceeded" -or `$resultado -match "TooManyRequests") {
        Write-Host " [SIN CAPACIDAD - Reintentando en 30s]" -ForegroundColor Yellow
        `$intento++
        Start-Sleep -Seconds 30
    } elseif (`$resultado -match "timed out" -or `$resultado -match "RequestException") {
        Write-Host " [TIMEOUT DE CONEXION - Reintentando en 15s]" -ForegroundColor DarkYellow
        `$intento++
        Start-Sleep -Seconds 15
    } else {
        Write-Host " [RESPUESTA INESPERADA]" -ForegroundColor Red
        Write-Host `$resultado -ForegroundColor DarkGray
        `$intento++
        Start-Sleep -Seconds 30
    }
}
"@

[System.IO.File]::WriteAllText("$HOME\Desktop\lanzar_vm.ps1", $scriptBody, [System.Text.Encoding]::UTF8)
Write-Host "¡Script generado en: $HOME\Desktop\lanzar_vm.ps1!" -ForegroundColor Green
```

---

## 6. PARTE 4: Ejecución del Script

Puedes ejecutar el script directamente desde el repositorio o desde tu Escritorio:

### Opción A — Ejecutar directamente desde el repositorio:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\infrastructure\scripts-poc-arquitectura\lanzar_vm.ps1
```

### Opción B — Ejecutar desde el Escritorio:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
cd $HOME\Desktop
.\lanzar_vm.ps1
```

*(Si pregunta por cambiar la directiva de ejecución, presiona `S` o `O` y dale Enter).*

Puedes **minimizar la ventana**. El script trabajará solo sin consumir recursos apreciables.

---

## 7. PARTE 5: ¿Qué hacer después de que el Script tenga Éxito?

Cuando el script muestre en verde: **`[EXITO] ¡MAQUINA VIRTUAL CREADA CON EXITO!`**, sigue estos pasos para desplegar HealthRadar:

### Paso 5.1 — Obtener la IP Pública
1. Ve a la consola web de OCI → **Compute** → **Instances**.
2. Haz clic en tu máquina **`healthradar-vm-prod`**.
3. En la sección **Primary VNIC**, copia la **Public IP Address** (ejemplo: `129.148.x.x`).

### Paso 5.2 — Conectarte por SSH a la VM
En tu PowerShell (o Git Bash) local:
```powershell
ssh -i "$HOME\.ssh\healthradar-oci" opc@<IP_PUBLICA>
```
*(Escribe `yes` cuando te pregunte si confías en el host).*

### Paso 5.3 — Abrir los puertos en el Firewall interno de Oracle Linux
Oracle Linux tiene su propio cortafuegos (`firewalld`). Abre los puertos del proyecto ejecutando dentro de la VM:
```bash
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-port=5678/tcp
sudo firewall-cmd --permanent --add-port=6006/tcp
sudo firewall-cmd --reload
```

### Paso 5.4 — Instalar Docker y Docker Compose
Ejecuta en la VM:
```bash
# Instalar Docker
sudo dnf update -y
sudo dnf install -y docker docker-compose-plugin

# Habilitar el servicio Docker
sudo systemctl enable --now docker

# Agregar el usuario opc al grupo docker (para usar docker sin sudo)
sudo usermod -aG docker opc

# Salir para aplicar permisos
exit
```
Vuelve a entrar:
```powershell
ssh -i "$HOME\.ssh\healthradar-oci" opc@<IP_PUBLICA>
```

### Paso 5.5 — Clonar el repositorio y levantar HealthRadar
```bash
# Clonar repositorio
git clone https://github.com/tu-organizacion/Celula5_HealthRadar.git
cd Celula5_HealthRadar/infrastructure

# Configurar variables de entorno
cp .env.example .env
nano .env  # Ajusta tus secretos si es necesario

# Levantar los contenedores
docker compose up -d

# Verificar estado
docker compose ps
```

### Paso 5.6 — Comprobación de Servicios
Abre tu navegador web y comprueba:
- **Frontend Next.js:** `http://<IP_PUBLICA>:3000`
- **Arize Phoenix (Observabilidad):** `http://<IP_PUBLICA>:6006`
- **n8n (Orquestador):** `http://<IP_PUBLICA>:5678`
