## Descripción del cambio

<!-- 1-3 líneas: qué hace este PR y por qué es necesario -->

Closes #<!-- número del Issue (obligatorio) -->

## Autor y rol

- **Nombre:** <!-- tu nombre -->
- **Rol:** <!-- DevSecOps / Backend & IA / Frontend / QA & Prompts / Scrum Master / Arquitecto -->

## Tipo de cambio

- [ ] Microfrontend (dashboard / consulta / historicos)
- [ ] Workflow n8n (`src/n8n-workflows/`)
- [ ] Migración SQL (`src/database/migrations/`)
- [ ] `@healthradar/core` (`src/core/`)
- [ ] Prompts / QA IA (`src/ia-ops/`)
- [ ] Infraestructura / CI-CD (`infrastructure/`, `.github/`)
- [ ] Documentación / ADR

## Pruebas realizadas

<!-- Describe cómo probaste que tu cambio funciona. Sé específico: comandos ejecutados, resultados obtenidos -->

## Cumplimiento de arquitectura y Verificación de seguridad (Descarma si es Necesario)

- [ ] Sin credenciales ni `.env` en el commit; variables sensibles documentadas en `infrastructure/.env.example`, no hardcodeadas en compose
- [ ] El navegador no llama a PostgreSQL, n8n ni a ningún LLM directamente; todo pasa por las rutas `/api/*` del propio MF (BFF, ADR-004/ADR-014)
- [ ] LLMs según ADR-003: Gemini (3 llaves) para ingesta; NVIDIA Kimi/GLM (failover a Gemini) para consulta NLQ
- [ ] Solo `nginx-shell` expone puerto público (`3000`); no agregué `ports:` a otros servicios (ADR-008); límite RAM 3,456 MB respetado (ADR-011)
- [ ] Navegación cross-zone con `<a href>`, no `<Link>` (ADR-013); sin imports entre microfrontends
- [ ] Si invoqué un LLM en n8n, el flujo envía traza a Phoenix (ADR-010)
- [ ] Migraciones: numeradas, idempotentes (registradas en `healthradar_schema_migrations` por deploy.yml)
- [ ] Si hay decisión arquitectónica nueva, viene con su ADR en `infrastructure/ADRs/`

## Nota para el Arquitecto

<!-- Opcional: qué punto requiere revisión especial, o decisiones que le corresponden a él -->
