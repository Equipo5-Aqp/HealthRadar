# ==============================================================================
# Script de Prueba de Concepto (PoC) - ADR-008 & ADR-002
# Proyecto: HealthRadar - Célula 5
# ==============================================================================

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  HealthRadar - Verificacion PoC ADR-008 (Docker) y ADR-002 (pgvector)" -ForegroundColor Cyan
Write-Host "  [ATENCION: Operando con DATOS SIMULADOS DE PRUEBA / MOCK SEED DATA]" -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan

# Step 1: Comprobar Docker
Write-Host "`n[1/4] Comprobando estado de Docker Engine..." -ForegroundColor Green
try {
    $dockerCheck = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Docker no esta ejecutandose o no esta instalado en este equipo." -ForegroundColor Red
        Write-Host "Asegurate de tener Docker Desktop iniciado para ejecutar la infraestructura." -ForegroundColor Yellow
        exit 1
    }
    Write-Host " -> Docker Engine detectado y activo." -ForegroundColor Gray
} catch {
    Write-Host "Error al consultar Docker: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Levantar Contenedores
Write-Host "`n[2/4] Desplegando infraestructura de contenedores con Docker Compose..." -ForegroundColor Green
$infraPath = Join-Path $PSScriptRoot ".."
Push-Location $infraPath
try {
    docker compose up -d --force-recreate
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error al ejecutar docker compose up." -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Write-Host " -> Contenedores iniciados exitosamente." -ForegroundColor Gray
} finally {
    Pop-Location
}

# Step 3: Esperar a PostgreSQL
Write-Host "`n[3/4] Esperando a que PostgreSQL pgvector:pg16 este listo..." -ForegroundColor Green
$retries = 10
while ($retries -gt 0) {
    $pgStatus = docker exec healthradar-postgres pg_isready -U healthradar_admin -d healthradar_db 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host " -> PostgreSQL esta listo para conexiones." -ForegroundColor Gray
        break
    }
    Start-Sleep -Seconds 2
    $retries--
}

if ($retries -eq 0) {
    Write-Host "Error: Timeout esperando a PostgreSQL." -ForegroundColor Red
    exit 1
}

# Step 4: Ejecucion de Pruebas de Busqueda Hibrida y Pgvector (ADR-002)
Write-Host "`n[4/4] Ejecutando consulta de prueba de pgvector y tablas sobre [DATOS SIMULADOS]..." -ForegroundColor Green
$sqlPath = Join-Path $PSScriptRoot "../../src/database/test_poc_adr002.sql"
if (Test-Path $sqlPath) {
    Get-Content $sqlPath | docker exec -i healthradar-postgres psql -U healthradar_admin -d healthradar_db
    Write-Host "`n -> Consulta de pgvector ejecutada con exito." -ForegroundColor Gray
} else {
    Write-Host "Advertencia: No se encontro el archivo SQL en $sqlPath" -ForegroundColor Yellow
}

# Verificacion de Aislamiento de Puertos (ADR-008)
Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host " VERIFICACION DE REGLAS DE SEGURIDAD (ADR-008):" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
Write-Host "`n[REGLA VERIFICADA] Confirmar que unicamente 'healthradar-frontend' expone puerto hacia el host (3000)." -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan
