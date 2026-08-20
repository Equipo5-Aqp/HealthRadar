# HealthRadar

Sistema de vigilancia epidemiológica automatizada para el Perú, desarrollado por la Célula 5.

Integra datos de enfermedades de notificación obligatoria del MINSA/CDC Perú con variables climáticas de Open-Meteo, y permite que analistas de salud pública consulten el historial en lenguaje natural.

---

## Arquitectura del Sistema

El sistema sigue un flujo de datos estricto donde cada capa tiene una responsabilidad única:

```
Analista de Salud
      │
      ▼
Frontend (Next.js)          ← única interfaz pública, puerto 3000 (ADR-004)
      │  /api/query (server-side proxy)
      ▼
n8n Self-Hosted             ← orquestador único de toda la lógica (ADR-001)
      │
      ├── Workflow de Ingesta (semanal, automático)
      │       ├── Descarga PDF boletín MINSA/CDC Perú (ADR-006)
      │       ├── Open-Meteo → variables climáticas por coordenadas (ADR-007)
      │       ├── Google Gemini Flash → extracción multimodal JSON estructurado (ADR-003)
      │       ├── Validación de esquema JSON
      │       ├── Inserción en PostgreSQL (ADR-002)
      │       └── Traza enviada a Arize Phoenix (ADR-010)
      │
      └── Workflow de Consulta NLQ (por webhook)
              ├── Consulta PostgreSQL (datos + vectores)
              ├── Claude Haiku (Anthropic) → reporte analítico en lenguaje natural (ADR-003)
              ├── Traza enviada a Arize Phoenix (ADR-010)
              └── Respuesta al Frontend

PostgreSQL 16 + pgvector    ← base de datos única (tabular + vectorial) (ADR-002)
Arize Phoenix Self-Hosted   ← observabilidad pasiva y evaluación de LLMs (ADR-010)
```

**Regla crítica de arquitectura:** el Frontend no accede directamente a la base de datos ni a ninguna API de IA. Todo pasa por n8n.

---

## Flujo del Dato — Consulta en Lenguaje Natural (NLQ)

El siguiente diagrama muestra el recorrido completo de una consulta desde que el analista la escribe hasta que recibe el reporte:

```mermaid
sequenceDiagram
    actor Analista as Analista de Salud
    participant FE as Frontend Next.js
    participant API as /api/query (server-side)
    participant N8N as n8n Self-Hosted
    participant PG as PostgreSQL + pgvector
    participant CLAUDE as Claude Haiku (Anthropic)
    participant PHX as Arize Phoenix

    Analista->>FE: Escribe consulta en lenguaje natural
    FE->>API: POST /api/query { pregunta }
    Note over API: Credenciales de n8n permanecen<br/>en el servidor, nunca en el navegador

    API->>N8N: Webhook POST con la consulta
    N8N->>PG: Consulta SQL por distrito, semana y enfermedad
    PG-->>N8N: Datos epidemiológicos y climáticos estructurados

    N8N->>CLAUDE: Prompt con los datos + pregunta del analista
    CLAUDE-->>N8N: Reporte analítico en lenguaje natural

    N8N->>PHX: Traza completa HTTP/OTel (prompt, respuesta, tokens, latencia)
    PHX-->>N8N: Confirmación de registro

    N8N-->>API: Reporte generado
    API-->>FE: Respuesta JSON
    FE-->>Analista: Reporte visualizado en el dashboard
```

---

## Flujo del Dato — Ingesta Semanal Automatizada

```mermaid
sequenceDiagram
    participant SCH as Schedule Trigger (n8n)
    participant N8N as n8n Self-Hosted
    participant MINSA as MINSA/CDC Perú
    participant OM as Open-Meteo API
    participant GEMINI as Google Gemini Flash
    participant PG as PostgreSQL + pgvector
    participant PHX as Arize Phoenix

    SCH->>N8N: Dispara workflow cada semana
    N8N->>MINSA: Descarga boletín epidemiológico en PDF
    MINSA-->>N8N: PDF de la semana epidemiológica

    N8N->>OM: GET coordenadas de distritos del Perú
    OM-->>N8N: Temperatura máxima y precipitación acumulada

    N8N->>GEMINI: PDF nativo + esquema JSON de extracción
    GEMINI-->>N8N: JSON estructurado con casos y tablas por distrito

    Note over N8N: Validación de esquema JSON<br/>Rechaza datos mal formados

    N8N->>PG: INSERT en casos_epidemiologicos y datos_climaticos
    N8N->>PHX: Traza de extracción (Monitoreo de Data Drift)
```

---

## Decisiones de Arquitectura (ADRs)

Cada decisión técnica relevante del proyecto está documentada en `infrastructure/ADRs/`.

| ADR | Título | Estado |
|-----|--------|--------|
| [ADR-001](infrastructure/ADRs/ADR-001-n8n-self-hosted-orquestacion.md) | n8n Self-Hosted como capa de orquestación | Vigente |
| [ADR-002](infrastructure/ADRs/ADR-002-postgresql-pgvector-base-de-datos.md) | PostgreSQL con pgvector como única base de datos | Vigente |
| [ADR-003](infrastructure/ADRs/ADR-003-division-llms-por-momento-operacion.md) | División de LLMs por momento de operación (Gemini + Claude) | Vigente |
| [ADR-004](infrastructure/ADRs/ADR-004-nextjs-frontend-capa-seguridad.md) | Next.js con rutas de API como capa de seguridad | Vigente |
| [ADR-005](infrastructure/ADRs/ADR-005-langfuse-observabilidad-llms.md) | Langfuse como plataforma de observabilidad | Reemplazado por ADR-010 |
| [ADR-006](infrastructure/ADRs/ADR-006-minsa-cdc-fuente-datos-epidemiologicos.md) | MINSA/CDC Perú como fuente de datos epidemiológicos | Vigente |
| [ADR-007](infrastructure/ADRs/ADR-007-open-meteo-fuente-datos-climaticos.md) | Open-Meteo como fuente de datos climáticos | Vigente |
| [ADR-008](infrastructure/ADRs/ADR-008-docker-compose.md) | Docker Compose como estrategia de despliegue | Vigente |
| [ADR-009](infrastructure/ADRs/ADR-009-oci-always-free-hosting.md) | OCI Always Free como proveedor de hosting | Vigente |
| [ADR-010](infrastructure/ADRs/ADR-010-arize-phoenix-observabilidad-llms.md) | Arize Phoenix Self-Hosted como plataforma de observabilidad | Vigente |

---

## Levantar el Sistema Localmente

**Requisito previo:** tener Docker Desktop instalado y activo.

```bash
# 1. Clonar el repositorio
git clone https://github.com/Roberto-Bautista/Celula5_HealthRadar.git
cd Celula5_HealthRadar

# 2. Configurar variables de entorno
cp infrastructure/.env.example infrastructure/.env
# Editar infrastructure/.env con las credenciales propias

# 3. Levantar los 4 servicios
cd infrastructure
docker compose up -d

# 4. Verificar que todos los contenedores están activos
docker compose ps
```

El sistema queda disponible en `http://localhost:3000` (Frontend).

---

## Estructura del Repositorio

```
/
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/               # Pipelines de CI/CD
├── infrastructure/
│   ├── ADRs/                    # Decisiones de arquitectura (ADR-001 al ADR-010)
│   ├── diagrams/                # Diagramas C4 en Draw.io XML (L1, L2, L3)
│   ├── scripts-poc-arquitectura/ # Scripts de verificación y PoCs de arquitectura
│   ├── docker-compose.yml       # Orquestación de contenedores
│   └── .env.example             # Plantilla de variables de entorno
├── src/
│   ├── frontend/                # Aplicación Next.js
│   ├── n8n-workflows/           # Workflows de n8n (JSON versionados)
│   ├── database/
│   │   ├── migrations/          # Migraciones SQL numeradas
│   │   └── test_poc_adr002.sql  # Script de prueba pgvector
│   └── ia-ops/                  # Prompts versionados y QA de modelos
└── README.md
```

---

## Seguridad

- Las credenciales se gestionan exclusivamente mediante variables de entorno (`.env`).
- El archivo `.env` está excluido del control de versiones por el `.gitignore`.
- La plantilla [`infrastructure/.env.example`](infrastructure/.env.example) documenta las variables requeridas sin valores reales.
- Los tokens de n8n nunca se exponen al navegador (ver [ADR-004](infrastructure/ADRs/ADR-004-nextjs-frontend-capa-seguridad.md)).
