<#
.SYNOPSIS
    Script de auto-aprovisionamiento y reintento continuo de VM Always Free (ARM64) en Oracle Cloud Infrastructure (OCI).

.DESCRIPTION
    Automatiza la solicitud de creación de la instancia Ampere A1 (VM.Standard.A1.Flex)
    reintentando automáticamente ante errores de falta de capacidad ("Out of capacity")
    hasta que Oracle asigne un cupo disponible.

.PARAMETER SshKeyFile
    Ruta a la clave pública SSH. Por defecto: $HOME\.ssh\healthradar-oci.pub

.PARAMETER VmDisplayName
    Nombre para la instancia en OCI. Por defecto: healthradar-vm-prod

.PARAMETER IntervalSeconds
    Intervalo de espera entre reintentos en segundos. Por defecto: 30

.PARAMETER AvailabilityDomain
    (Opcional) Nombre del Availability Domain. Si se omite, se consulta automáticamente vía OCI CLI.

.PARAMETER CompartmentId
    (Opcional) OCID del compartimento. Si se omite, se utiliza el Tenancy OCID del archivo de configuración.

.PARAMETER SubnetId
    (Opcional) OCID de la subred pública. Si se omite, busca la subred que contenga 'healthradar'.

.PARAMETER ImageId
    (Opcional) OCID de la imagen Oracle Linux 9 aarch64. Si se omite, se busca automáticamente.

.EXAMPLE
    .\lanzar_vm.ps1

.EXAMPLE
    .\lanzar_vm.ps1 -IntervalSeconds 20 -VmDisplayName "healthradar-vm-prod"
#>

[CmdletBinding()]
param (
    [string]$SshKeyFile = "$HOME\.ssh\healthradar-oci.pub",
    [string]$VmDisplayName = "healthradar-vm-prod",
    [int]$IntervalSeconds = 30,
    [string]$AvailabilityDomain,
    [string]$CompartmentId,
    [string]$SubnetId,
    [string]$ImageId
)

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  HEALTHRADAR - Aprovisionamiento Automatico VM OCI (ADR-009)" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Validar instalacion de OCI CLI
Write-Host "[1/4] Verificando OCI CLI..." -ForegroundColor Yellow
try {
    $ociVersion = oci --version 2>&1
    Write-Host " -> OCI CLI detectado (Version: $ociVersion)" -ForegroundColor Gray
} catch {
    Write-Host "ERROR: 'oci' CLI no esta instalado o no se encuentra en el PATH." -ForegroundColor Red
    Write-Host "Consulta el manual en infrastructure/manuals/Manual_Script_Auto_Deploy_OCI.md" -ForegroundColor Yellow
    exit 1
}

# 2. Validar archivo de configuracion OCI
$ociConfigFile = "$HOME\.oci\config"
if (-not (Test-Path $ociConfigFile)) {
    Write-Host "ERROR: No se encontro el archivo de configuracion OCI en $ociConfigFile" -ForegroundColor Red
    Write-Host "Por favor configura tu API Key y archivo de configuracion segun el manual." -ForegroundColor Yellow
    exit 1
}

# 3. Validar clave SSH
if (-not (Test-Path $SshKeyFile)) {
    Write-Host "ERROR: No se encontro la llave publica SSH en: $SshKeyFile" -ForegroundColor Red
    Write-Host "Generala con: ssh-keygen -t ed25519 -C `"healthradar-oci`" -f `"`$HOME\.ssh\healthradar-oci`"" -ForegroundColor Yellow
    exit 1
}
Write-Host " -> Llave SSH detectada: $SshKeyFile" -ForegroundColor Gray

# 4. Obtener parametros de OCI dinamicamente si no fueron provistos
Write-Host "`n[2/4] Resolviendo parametros de infraestructura en OCI..." -ForegroundColor Yellow

if (-not $CompartmentId) {
    try {
        $tenancyLine = Get-Content $ociConfigFile | Select-String "tenancy=" | Select-Object -First 1
        if ($tenancyLine) {
            $CompartmentId = $tenancyLine.Line.Split("=")[1].Trim()
        }
    } catch {
        Write-Host "Advertencia: No se pudo leer tenancy del archivo config." -ForegroundColor DarkYellow
    }
}

if (-not $AvailabilityDomain) {
    Write-Host " -> Consultando Availability Domain..." -ForegroundColor Gray
    $AvailabilityDomain = (oci iam availability-domain list --query "data[0].name" --raw-output 2>$null)
}

if (-not $SubnetId) {
    Write-Host " -> Buscando subred 'healthradar'..." -ForegroundColor Gray
    $SubnetId = (oci network subnet list --compartment-id $CompartmentId --query "data[?contains(`"display-name`", 'healthradar')].id | [0]" --raw-output 2>$null)
}

if (-not $ImageId) {
    Write-Host " -> Buscando imagen Oracle Linux 9 (ARM64/aarch64)..." -ForegroundColor Gray
    $ImageId = (oci compute image list --compartment-id $CompartmentId --operating-system "Oracle Linux" --operating-system-version "9" --shape "VM.Standard.A1.Flex" --query "data[?contains(`"display-name`", 'aarch64')].id | [0]" --raw-output 2>$null)
}

# Validar resolucion de parametros
if (-not $AvailabilityDomain -or -not $CompartmentId -or -not $SubnetId -or -not $ImageId) {
    Write-Host "ERROR: No se pudieron obtener todos los identificadores de OCI." -ForegroundColor Red
    Write-Host "  AD:          $AvailabilityDomain" -ForegroundColor DarkGray
    Write-Host "  Compartment: $CompartmentId" -ForegroundColor DarkGray
    Write-Host "  Subnet:      $SubnetId" -ForegroundColor DarkGray
    Write-Host "  Image:       $ImageId" -ForegroundColor DarkGray
    exit 1
}

$shape = "VM.Standard.A1.Flex"
$shapeConfig = '{"ocpus":2,"memoryInGBs":12}'

Write-Host " -> Availability Domain: $AvailabilityDomain" -ForegroundColor Gray
Write-Host " -> Subred:              $SubnetId" -ForegroundColor Gray
Write-Host " -> Imagen ARM64:        $ImageId" -ForegroundColor Gray
Write-Host " -> Shape:               $shape (2 OCPUs, 12 GB RAM - Always Free)" -ForegroundColor Gray

# 5. Bucle de reintentos
Write-Host "`n[3/4] Iniciando bucle de solicitud de cupo..." -ForegroundColor Green
Write-Host "El script reintentara cada $IntervalSeconds segundos. Puedes minimizar esta ventana." -ForegroundColor Yellow
Write-Host "----------------------------------------------------------------------" -ForegroundColor DarkGray

$intento = 1
$ErrorActionPreference = 'SilentlyContinue'

while ($true) {
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$timestamp] Intento #$intento - Solicitando instancia a OCI..." -ForegroundColor White -NoNewline

    $resultado = oci compute instance launch `
        --availability-domain "$AvailabilityDomain" `
        --compartment-id "$CompartmentId" `
        --shape "$shape" `
        --shape-config "$shapeConfig" `
        --subnet-id "$SubnetId" `
        --assign-public-ip true `
        --image-id "$ImageId" `
        --display-name "$VmDisplayName" `
        --ssh-authorized-keys-file "$SshKeyFile" `
        2>&1 | Out-String

    if ($resultado -match '"lifecycle-state": "PROVISIONING"' -or $resultado -match '"id": "ocid1.instance') {
        Write-Host ""
        Write-Host "======================================================================" -ForegroundColor Green
        Write-Host "  [EXITO] ¡MAQUINA VIRTUAL CREADA CON EXITO EN OCI!" -ForegroundColor Green
        Write-Host "======================================================================" -ForegroundColor Green
        Write-Host $resultado
        Write-Host "`nSiguientes pasos:" -ForegroundColor Cyan
        Write-Host " 1. Consulta la IP publica en la consola de OCI." -ForegroundColor White
        Write-Host " 2. Conectate por SSH: ssh -i `"$($SshKeyFile.Replace('.pub',''))`" opc@<IP_PUBLICA>" -ForegroundColor White
        Write-Host " 3. Sigue la guia en infrastructure/manuals/Manual_Script_Auto_Deploy_OCI.md" -ForegroundColor White
        break
    } elseif ($resultado -match "capacity" -or $resultado -match "InternalError" -or $resultado -match "LimitExceeded" -or $resultado -match "TooManyRequests") {
        Write-Host " [SIN CAPACIDAD - Reintentando en ${IntervalSeconds}s]" -ForegroundColor Yellow
        $intento++
        Start-Sleep -Seconds $IntervalSeconds
    } elseif ($resultado -match "timed out" -or $resultado -match "RequestException") {
        Write-Host " [TIMEOUT DE CONEXION - Reintentando en 15s]" -ForegroundColor DarkYellow
        $intento++
        Start-Sleep -Seconds 15
    } else {
        Write-Host " [RESPUESTA INESPERADA]" -ForegroundColor Red
        Write-Host $resultado -ForegroundColor DarkGray
        $intento++
        Start-Sleep -Seconds $IntervalSeconds
    }
}
