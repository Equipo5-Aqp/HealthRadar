# HealthRadar

Sistema de vigilancia epidemiológica para el Perú (Dengue, EDA e IRA). Ingesta boletines del MINSA/CDC y clima de Open-Meteo mediante n8n, y expone dashboards y consultas en lenguaje natural.

## Fuente de verdad

Este README es la entrada única para onboarding, versiones y comandos. No repite decisiones de arquitectura: esas viven en los ADRs.

| Tema | Fuente canónica |
| --- | --- |
| Versiones de React/Next | `src/mf-*/package.json` y sus `package-lock.json` |
| Versión de n8n | `infrastructure/n8n/Dockerfile` |
| Puertos, RAM, servicios e IPs | `infrastructure/docker-compose.yml` |
| Decisiones de arquitectura | `infrastructure/ADRs/` |
| Reglas para agentes IA | `AGENTS.md` |
| Despliegue en Azure | `infrastructure/manuals/Manual_Despliegue_Azure_VM.md` |
| Backups y restore | `infrastructure/manuals/Manual_Backup_Restore_HU-303.md` |

Si un documento contradice el código o un ADR, prevalecen el código y el ADR.

## Versiones del stack

| Componente | Versión | Fuente |
| --- | --- | --- |
| Next.js | `16.3.1` | `src/mf-*/package.json` |
| React / React DOM | `19.2.8` | `src/mf-*/package.json` |
| n8n | `2.35.7` | `infrastructure/n8n/Dockerfile` |
| PostgreSQL | `16` + pgvector | `infrastructure/docker-compose.yml` |
| Arize Phoenix | `20.3.0` | `infrastructure/docker-compose.yml` |
| nginx | `1.27-alpine` | `infrastructure/docker-compose.yml` |
| Node.js (microfrontends) | `20.x` (Next exige `>=20.9.0`) | `src/mf-*/Dockerfile` |
| Python (CI/ETL) | `3.11` | `.github/workflows/`, `requirements.txt` |

No se deben cambiar versiones de React/Next en un solo microfrontend: los tres deben quedar alineados. El CI lo valida.

## Arquitectura

```text
Internet :3000
      |
      v
nginx-shell (unico puerto publico)
      |-- /            -> mf-dashboard
      |-- /consulta    -> mf-consulta
      `-- /historicos  -> mf-historicos

Microfrontends -> /api/* (BFF server-side) -> n8n:5678
                                              |-- PostgreSQL 16 + pgvector
                                              `-- Arize Phoenix
```

Regla perimetral: solo `nginx-shell` publica `3000`. PostgreSQL, n8n y Phoenix quedan en la red interna `healthradar-net` (`172.20.0.0/16`).

## Contratos HTTP

| BFF | Webhook n8n | Workflow |
| --- | --- | --- |
| `POST /api/consulta` | `/webhook/consulta` | `Conexion posgrestV4` |
| `POST /api/tendencia` | `/webhook/tendencia` | `Conexion de posgrestV4` |
| `POST /api/historicos` | `/webhook/historicos` | `Conexion de posgrestV4` |
| `POST /api/panorama` | `/webhook/panorama` | `PanoramaV4` |
| `POST /api/departamentos` | `/webhook/departamentos` | `Casos por departamentoV4` |
| `POST /api/auth/login` | `/webhook/auth-login` | `Autenticacion HealthRadarV4` |
| `POST /api/auth/sesion` | `/webhook/auth-sesion` | `Autenticacion HealthRadarV4` |
| `POST /api/auth/logout` | `/webhook/auth-logout` | `Autenticacion HealthRadarV4` |

El navegador nunca llama a n8n, PostgreSQL ni proveedores de IA. Todas las llamadas pasan por las rutas server-side `/api/*` de cada microfrontend.

## Flujos de datos

- **Histórico:** `src/database/limpiar_datasets_minsa.py` + `src/database/cargar_datos_minsa.py` cargan los casos en las tablas `caso_dengue`, `caso_eda`, `caso_ira_neumonia` y `caso_ira_no_neumonia`.
- **Boletines:** Fase A descubre enlaces cada 7 días y los encola en `boletin_descubierto`. Fase B corre cada 30 minutos, procesa un boletín pendiente y guarda un resumen validado con marcador `[CIFRAS]` en `boletin_descubierto`.
- **Clima:** la rama de clima de Fase B consulta Open-Meteo para los 25 departamentos y hace upsert en `dato_climatico` mediante `fn_insertar_dato_climatico`.
- **Embeddings:** el indexador corre cada 30 minutos, genera vectores de 768 dimensiones con `gemini-embedding-001` y los guarda en `boletin_descubierto.embedding`.
- **NLQ:** n8n consulta los datos, arma el contexto y usa la cadena Kimi K3 -> GLM 5.3 -> Gemini 3.5 Flash Lite con failover. Las respuestas y las trazas HTTP se envían a Phoenix.
- **OpenRouter:** no está implementado. Solo aparece en ADR-003 como contingencia futura.

## Decisiones de arquitectura

| ADR | Título | Estado |
| --- | --- | --- |
| [ADR-001](infrastructure/ADRs/ADR-001-n8n-self-hosted-orquestacion.md) | n8n Self-Hosted como capa de orquestación | Vigente |
| [ADR-002](infrastructure/ADRs/ADR-002-postgresql-pgvector-base-de-datos.md) | PostgreSQL con pgvector como única base de datos | Vigente |
| [ADR-003](infrastructure/ADRs/ADR-003-division-llms-por-momento-operacion.md) | División de LLMs por momento de operación | Vigente |
| [ADR-004](infrastructure/ADRs/ADR-004-nextjs-frontend-capa-seguridad.md) | Next.js con rutas de API como capa de seguridad | Vigente |
| [ADR-005](infrastructure/ADRs/ADR-005-langfuse-observabilidad-llms.md) | Langfuse como plataforma de observabilidad | Reemplazado por ADR-010 |
| [ADR-006](infrastructure/ADRs/ADR-006-minsa-cdc-fuente-datos-epidemiologicos.md) | MINSA/CDC Perú como fuente de datos epidemiológicos | Vigente |
| [ADR-007](infrastructure/ADRs/ADR-007-open-meteo-fuente-datos-climaticos.md) | Open-Meteo como fuente de datos climáticos | Vigente |
| [ADR-008](infrastructure/ADRs/ADR-008-docker-compose.md) | Docker Compose como estrategia de despliegue | Vigente |
| [ADR-009](infrastructure/ADRs/ADR-009-oci-always-free-hosting.md) | OCI Always Free como proveedor de hosting | Reemplazado por ADR-011 |
| [ADR-010](infrastructure/ADRs/ADR-010-arize-phoenix-observabilidad-llms.md) | Arize Phoenix Self-Hosted como plataforma de observabilidad | Vigente |
| [ADR-011](infrastructure/ADRs/ADR-011-azure-vm-hosting.md) | Microsoft Azure Virtual Machines como proveedor de hosting | Vigente |
| [ADR-012](infrastructure/ADRs/ADR-012-event-driven-architecture-n8n.md) | Arquitectura Basada en Eventos (EDA) en n8n con core desacoplado | Vigente |
| [ADR-013](infrastructure/ADRs/ADR-013-microservicios-frontend-microfrontends.md) | Microservicios Frontend con Next.js y Nginx | Vigente |
| [ADR-014](infrastructure/ADRs/ADR-014-autenticacion-sesion-nginx-auth-request.md) | Autenticación de sesión con Nginx auth_request | Vigente |

## Levantar el sistema localmente

Requisitos: Docker Desktop activo, Git y Bash (Git Bash o WSL) para ejecutar el migrador.

```bash
git clone https://github.com/Roberto-Bautista/Celula5_HealthRadar.git
cd Celula5_HealthRadar/infrastructure

cp .env.example .env
# Editar .env con credenciales propias

docker compose up -d
bash scripts-poc-arquitectura/migrate.sh
docker compose ps
```

El sistema queda disponible en `http://localhost:3000`.

Notas:

- Las migraciones ya no se ejecutan desde `/docker-entrypoint-initdb.d`; el único migrador es `infrastructure/scripts-poc-arquitectura/migrate.sh`.
- El migrador registra cada archivo en `healthradar_schema_migrations` y falla si una migración no aplica.
- En una base existente creada por el mecanismo anterior, el migrador marca las migraciones actuales como baseline y luego aplica solo las nuevas.

### Desarrollo local de microfrontends

```bash
# Terminal 1
cd src/mf-dashboard && npm ci && npm run dev   # http://localhost:3003

# Terminal 2
cd src/mf-consulta && npm ci && npm run dev    # http://localhost:3001

# Terminal 3
cd src/mf-historicos && npm ci && npm run dev  # http://localhost:3002
```

En desarrollo sin Nginx se abre directamente el puerto de cada microfrontend. La navegación cross-zone (`/`, `/consulta`, `/historicos`) solo funciona a través de `nginx-shell` en `http://localhost:3000`.

## CI/CD

- **`deploy.yml`:** push a `main` que toque `src/**` (excepto `src/n8n-workflows/**` y `src/ia-ops/**`), `src/database/migrations/**` o `infrastructure/**` (excepto ADRs, manuales, Markdown y `.env.example`). Despliega el SHA del evento, compila solo los servicios afectados y aplica migraciones con `infrastructure/scripts-poc-arquitectura/migrate.sh`.
- **`n8n-deploy-cd.yml`:** solo con tag `v*.*.*` o `workflow_dispatch`. Despliega el tag/ref exacto y requiere el environment `production`.
- **CI:** `frontend-ci.yml` compila los microfrontends y valida que React/Next estén alineados; `core-ci.yml` prueba `@healthradar/core`; `n8n-validate-ci.yml` valida JSON, secretos, Phoenix y la versión fijada de n8n.

## Estructura

```text
src/
  core/                 @healthradar/core (dominio puro)
  mf-dashboard/         / y autenticación
  mf-consulta/          /consulta
  mf-historicos/        /historicos
  database/             ETL histórico y migraciones SQL
  n8n-workflows/        workflows versionados
infrastructure/
  ADRs/                 decisiones de arquitectura
  manuals/              despliegue y backups
  n8n/                  imagen de n8n con @healthradar/core
  nginx/                Shell Router
  scripts-poc-arquitectura/  migrador y utilidades de infraestructura
  docker-compose.yml
```

## Seguridad

- `.env` nunca se versiona; la plantilla es `infrastructure/.env.example`.
- No usar `NEXT_PUBLIC_*` para credenciales ni URLs internas.
- Las credenciales de n8n y de los LLMs viven solo en el servidor.
- La cookie de sesión usa `HttpOnly` y `SameSite=Lax`; el detalle de TLS está en ADR-014.
