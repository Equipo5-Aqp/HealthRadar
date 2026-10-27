# AGENTS.md — HealthRadar

Guía para agentes IA. El repositorio es la fuente de verdad: si este archivo contradice el código, `infrastructure/docker-compose.yml` o un ADR, prevalece el código/ADR.

## Contexto mínimo

- Sistema de vigilancia epidemiológica (Dengue, EDA, IRA) para Perú.
- n8n ingesta boletines MINSA/CDC y clima Open-Meteo; PostgreSQL + pgvector almacena datos; Next.js expone dashboards y NLQ.
- Arquitectura, versiones y comandos: `README.md`.
- Decisiones: `infrastructure/ADRs/`. No duplicar su contenido aquí.

## Versiones fijadas

| Componente | Versión | Fuente de verdad |
| --- | ---: | --- |
| Node.js | `20.x` (`node:20-alpine`; CI `20`; mínimo `>=20.9.0`) | `src/mf-*/Dockerfile` y `.github/workflows/frontend-ci.yml` |
| Next.js | `16.3.1` | `src/mf-*/package.json` y `package-lock.json` |
| React / React DOM | `19.2.8` | `src/mf-*/package.json` y `package-lock.json` |

- Los tres microfrontends deben mantener exactamente las mismas versiones de Next.js, React y React DOM. El job `check-versions` del CI lo valida.
- No cambiar versiones en un solo microfrontend: actualizar los tres `package.json`, sus `package-lock.json` y `README.md` en el mismo cambio.
- No hay `.nvmrc` ni `.node-version`; el pin operativo de Node.js vive en Docker y CI.

## Reglas duras

1. No agregar contenedores ni subir límites de RAM sin aprobación del Arquitecto. La VM es Azure B2als_v2 con 4 GiB.
2. Solo `nginx-shell` expone puertos. PostgreSQL, n8n y Phoenix nunca llevan `ports:` público.
3. El navegador nunca llama a PostgreSQL, n8n ni APIs de IA. Todo pasa por las rutas server-side `/api/*` de cada microfrontend.
4. No hay imports entre microfrontends. Cada uno es independiente y conserva `output: 'standalone'`.
5. No usar `next/link` para navegar entre zonas; usar `<a href="...">`.
6. No usar `NEXT_PUBLIC_*` para credenciales ni URLs internas.
7. Sin secretos ni `.env` en commits. La plantilla es `infrastructure/.env.example`.
8. La lógica de dominio vive en `src/core/` (`@healthradar/core`). Los nodos Code de n8n solo hacen `require('@healthradar/core')`; no hardcodear reglas.
9. Las migraciones SQL deben ser numeradas e idempotentes. El único migrador es `infrastructure/scripts-poc-arquitectura/migrate.sh`.
10. No reformatear archivos completos ni revertir cambios ajenos. Preservar el estilo existente.

## Mapa de trabajo

| Si tocas... | Revisa también... |
| --- | --- |
| `src/core/` | Tests de `src/core/`, workflows n8n que lo consumen y migraciones |
| Webhooks o contratos | `src/mf-*/src/app/api/`, `src/n8n-workflows/production/` y `src/core/` |
| Esquema SQL | `src/database/migrations/`, `src/core/` y workflows que escriben esas tablas |
| Frontend | `src/mf-*/package.json`, `next.config.*` y el CI de frontend |
| Infraestructura | `infrastructure/docker-compose.yml`, ADRs y `deploy.yml` |
| LLMs | ADR-003/ADR-010, variables de entorno y trazas a Phoenix |

## Flujos y eventos

- BFF y webhooks vigentes: `README.md`.
- Ingesta: Fase A (descubrimiento semanal), Fase B (procesamiento cada 30 minutos), clima y embeddings.
- Los casos históricos se cargan con el ETL de `src/database/`; no los escribe n8n.
- OpenRouter no está implementado. No documentarlo como proveedor activo.
- Toda llamada LLM debe emitir traza a Phoenix.

## Verificación

- Frontend: `npm ci && npm run build` en cada microfrontend.
- Core: `npm test` dentro de `src/core/`.
- n8n: validar JSON y referencias con los workflows de `.github/workflows/`.
- Infraestructura: `docker compose -f infrastructure/docker-compose.yml config`.
- Si no encuentras el comando correcto, pregunta antes de inventarlo.
