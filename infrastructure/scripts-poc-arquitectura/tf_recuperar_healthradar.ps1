<#
.SYNOPSIS
    Levanta (o retira) la VM de recuperacion de HealthRadar con Terraform desde Windows 11 (ADR-015).

.DESCRIPTION
    1. Verifica que Terraform y Azure CLI esten instalados y que haya sesion en Azure.
    2. Ejecuta terraform init + apply con crear_vm=true (o false con -Destruir).
    3. Muestra la IP nueva y los pasos siguientes.
    Terraform pide confirmacion ("yes") antes de crear o borrar cualquier recurso.
    -Destruir solo borra la VM de recuperacion: Storage y Key Vault tienen prevent_destroy.

.PARAMETER Destruir
    Retira la VM de recuperacion (fin de un simulacro). No toca backups ni secretos.

.EXAMPLE
    .\tf_recuperar_healthradar.ps1
    .\tf_recuperar_healthradar.ps1 -Destruir
#>

[CmdletBinding()]
param (
    [switch]$Destruir
)

$ErrorActionPreference = 'Stop'
$tfDir = (Resolve-Path (Join-Path $PSScriptRoot "..\terraform")).Path

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  HEALTHRADAR - Recuperacion ante desastres con Terraform (ADR-015)" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

# 1. Herramientas
Write-Host "[1/4] Verificando herramientas..." -ForegroundColor Yellow
$faltan = @()
if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) { $faltan += "Hashicorp.Terraform" }
if (-not (Get-Command az -ErrorAction SilentlyContinue)) { $faltan += "Microsoft.AzureCLI" }
if ($faltan.Count -gt 0) {
    Write-Host "ERROR: faltan herramientas. Instalalas y abre una terminal nueva:" -ForegroundColor Red
    foreach ($id in $faltan) { Write-Host "  winget install --id $id -e" -ForegroundColor Yellow }
    exit 1
}

if (-not (Test-Path (Join-Path $tfDir "terraform.tfvars"))) {
    Write-Host "ERROR: falta $tfDir\terraform.tfvars (copiar terraform.tfvars.example y completarlo)." -ForegroundColor Red
    exit 1
}

# 2. Sesion de Azure (terraform usa las credenciales de az CLI)
Write-Host "[2/4] Verificando sesion de Azure..." -ForegroundColor Yellow
# En PowerShell 5.1, el stderr de un ejecutable con 'Stop' se vuelve error terminante.
$ErrorActionPreference = 'Continue'
az account show --query name -o tsv 2>$null | Out-Null
$sinSesion = ($LASTEXITCODE -ne 0)
$ErrorActionPreference = 'Stop'
if ($sinSesion) {
    az login | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: az login fallo." -ForegroundColor Red; exit 1 }
}
Write-Host " -> Suscripcion: $(az account show --query name -o tsv)" -ForegroundColor Gray

# 3. Terraform
Write-Host "[3/4] terraform init..." -ForegroundColor Yellow
terraform "-chdir=$tfDir" init -input=false
if ($LASTEXITCODE -ne 0) { exit 1 }

if ($Destruir) {
    Write-Host "[4/4] Retirando la VM de recuperacion (Storage y Key Vault se conservan)..." -ForegroundColor Yellow
    terraform "-chdir=$tfDir" apply -var "crear_vm=false"
    if ($LASTEXITCODE -ne 0) { exit 1 }
    Write-Host ""
    Write-Host "[EXITO] VM de recuperacion retirada." -ForegroundColor Green
    exit 0
}

Write-Host "[4/4] Creando la VM de recuperacion (revisa el plan y escribe 'yes')..." -ForegroundColor Yellow
terraform "-chdir=$tfDir" apply -var "crear_vm=true"
if ($LASTEXITCODE -ne 0) { exit 1 }

$ip = terraform "-chdir=$tfDir" output -raw ip_publica

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "  [EXITO] VM creada: $ip" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "La VM se restaura sola en ~30-40 min (swap, Docker, build, restore)." -ForegroundColor Gray
Write-Host ""
Write-Host "Seguir el progreso:" -ForegroundColor Yellow
Write-Host "  ssh -i `"$HOME\.ssh\healthradar-vm_key.pem`" azureuser@$ip 'tail -f /var/log/healthradar-bootstrap.log'"
Write-Host "Abrir cuando termine:  http://${ip}:3000"
Write-Host ""
Write-Host "Si esta VM queda como PRODUCCION:" -ForegroundColor Yellow
Write-Host "  1. Poner crear_vm = true en terraform.tfvars (un apply sin -var la borraria)."
Write-Host "  2. Actualizar el secreto AZURE_VM_HOST de GitHub con $ip (Settings > Secrets > Actions)."
Write-Host "Si es un SIMULACRO, al terminar:  .\tf_recuperar_healthradar.ps1 -Destruir"
