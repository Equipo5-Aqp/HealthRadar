## Descripción del cambio

<!-- Explica brevemente qué hace este PR y por qué es necesario -->


## Issue relacionado

Closes #<!-- Número del Issue en GitHub Projects. Obligatorio. Sin este campo el PR no se aprueba. -->

## Autor y rol

- **Nombre:** <!-- Tu nombre completo -->
- **Rol en la célula:** <!-- DevSecOps / Backend & IA / Frontend / QA & Prompt Engineer / Scrum Master / Arquitecto -->

## Tipo de cambio

<!-- Marca con una X lo que aplique -->

- [ ] Nueva funcionalidad
- [ ] Corrección de bug
- [ ] Refactor (sin cambio de funcionalidad)
- [ ] Documentación / ADR
- [ ] Infraestructura / CI-CD
- [ ] Base de datos (migración SQL)
- [ ] Workflow de n8n (JSON exportado)
- [ ] Prompt Engineering (ia-ops)

## Archivos modificados

<!-- Lista los archivos principales que cambia este PR y qué hace cada uno -->

-
-

## Verificación de seguridad

- [ ] No hay credenciales, tokens ni API keys escritos en el código fuente
- [ ] No hay archivos `.env` incluidos en el commit
- [ ] Las variables sensibles están en `.env`, no en el `docker-compose.yml`
- [ ] Las rutas de API de Next.js no exponen URLs de webhook al navegador (`NEXT_PUBLIC_` no se usó para credenciales)
- [ ] Si se modificó un JSON de n8n, no contiene credenciales en texto plano dentro del JSON

## Cumplimiento de arquitectura

- [ ] El Frontend no llama directamente a PostgreSQL ni a ninguna API de IA
- [ ] Todo flujo de datos pasa por n8n (Frontend → /api/query → n8n → DB/LLM) (ADR-001/004)
- [ ] Los flujos de IA respetan la división por momento de operación: Gemini Flash para ingesta PDF y Claude Haiku para consultas NLQ (ADR-003)
- [ ] Si se modificó el `docker-compose.yml`, solo el Frontend expone puerto público al host por defecto (ADR-008)
- [ ] Si se agregó un workflow de n8n, el JSON exportado está en `src/n8n-workflows/`
- [ ] Si se agregaron o modificaron prompts, están versionados en `src/ia-ops/prompts/` y no hardcodeados
- [ ] Si se invocó un LLM en n8n, el workflow incluye el nodo de envío de traza a Arize Phoenix (ADR-010)
- [ ] Si se crearon o modificaron tablas, las migraciones SQL están en `src/database/migrations/` (ADR-002)

## Pruebas realizadas

<!-- Describe cómo probaste que tu cambio funciona. Sé específico: comandos ejecutados, resultados obtenidos -->


## Nota para el Arquitecto

<!-- Señala qué parte del código requiere atención especial en la revisión (flujo de datos, seguridad, estructura del JSON de n8n, etc.) -->


## Checklist antes de solicitar revisión

- [ ] El código corre localmente sin errores
- [ ] Los pipelines de GitHub Actions pasan (verde)
- [ ] El PR tiene el ID del Issue en la sección "Issue relacionado"
- [ ] El título del PR describe claramente el cambio
- [ ] Se asignó al Arquitecto como Reviewer en GitHub
