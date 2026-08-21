<#
.SYNOPSIS
    Script helper en PowerShell para conectar y aprovisionar la VM de Azure en HealthRadar.

.DESCRIPTION
    1. Localiza la clave SSH descargada (healthradar-vm_key.pem) en Downloads y la mueve a ~/.ssh/.
    2. Aplica los permisos de seguridad de Windows adecuados para SSH.
    3. Establece la conexión SSH con la VM de Azure.

.PARAMETER AzurePublicIp
    Dirección IP pública de la máquina virtual creada en Azure.

.EXAMPLE
    .\conectar_azure_vm.ps1 -AzurePublicIp "20.120.45.67"
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $false)]
    [string]$AzurePublicIp
)

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  HEALTHRADAR - Conexion y Despliegue en Azure VM (ADR-009)" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Gestionar la llave SSH
$sshDir = "$HOME\.ssh"
if (-not (Test-Path $sshDir)) {
    New-Item -ItemType Directory -Force -Path $sshDir | Out-Null
}

$destKey = "$sshDir\healthradar-vm_key.pem"
$downloadKey = "$HOME\Downloads\healthradar-vm_key.pem"

if (-not (Test-Path $destKey)) {
    if (Test-Path $downloadKey) {
        Write-Host "[1/3] Moviendo llave SSH desde Descargas a $destKey..." -ForegroundColor Yellow
        Copy-Item $downloadKey $destKey -Force
    } else {
        Write-Host "ERROR: No se encontro 'healthradar-vm_key.pem' en Descargas ni en $destKey." -ForegroundColor Red
        Write-Host "Asegurate de que el archivo .pem descargado de Azure este disponible." -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "[1/3] Llave SSH detectada en: $destKey" -ForegroundColor Gray
}

# 2. Ajustar permisos de la llave en Windows (evita el error 'UNPROTECTED PRIVATE KEY FILE')
Write-Host "[2/3] Verificando permisos de seguridad de la llave privada..." -ForegroundColor Yellow
try {
    icacls $destKey /inheritance:r | Out-Null
    icacls $destKey /grant:r "$($env:USERNAME):(R)" | Out-Null
    Write-Host " -> Permisos ACL configurados correctamente." -ForegroundColor Gray
} catch {
    Write-Host " -> Permisos existentes conservados." -ForegroundColor DarkGray
}

# 3. Solicitar IP si no se paso por parametro
if (-not $AzurePublicIp) {
    Write-Host ""
    $AzurePublicIp = Read-Host "Ingresa la IP Publica de tu VM de Azure (ej. 20.120.x.x)"
}

if (-not $AzurePublicIp) {
    Write-Host "ERROR: Debes proporcionar una IP publica valida." -ForegroundColor Red
    exit 1
}

Write-Host "`n[3/3] Conectando por SSH a azureuser@$AzurePublicIp..." -ForegroundColor Green
Write-Host "----------------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "Consejo: Escribe 'yes' si te pregunta por la huella digital (fingerprint)." -ForegroundColor Yellow
Write-Host "----------------------------------------------------------------------" -ForegroundColor DarkGray

ssh -i $destKey azureuser@$AzurePublicIp
