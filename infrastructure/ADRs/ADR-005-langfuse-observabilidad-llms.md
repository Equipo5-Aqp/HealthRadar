# ADR-005: Uso de Langfuse como plataforma de observabilidad para LLMs

**Estado:** Reemplazado por [ADR-010](ADR-010-arize-phoenix-observabilidad-llms.md) (2026-08-19)

> **Nota de reemplazo:** Langfuse v2 alcanzó fin de ciclo de vida (EOL) en Q1-2025. Su versión moderna (v3+) requiere una arquitectura distribuida de 6 contenedores (ClickHouse, Redis, MinIO, Web, Worker, PostgreSQL) inviable para el host de recursos Always Free en OCI (ADR-009). Se adoptó Arize Phoenix en ADR-010 como solución en un único contenedor.

## Contexto

HealthRadar utiliza dos modelos de lenguaje distintos en momentos
diferentes del sistema: Claude Haiku 4.5 para extracción de datos
desde PDFs del MINSA, y Grok para generación de reportes en lenguaje
natural. El caso de estudio exige monitorear dos fenómenos críticos:
Data Drift, cuando el MINSA cambia el formato de sus boletines y Haiku
empieza a extraer datos incorrectos sin que nadie lo detecte, y Prompt
Drift, cuando las respuestas de Grok varían sin razón aparente ante
consultas similares. Sin una herramienta de observabilidad, estos
problemas solo se detectan cuando el analista recibe un reporte
incorrecto, que es demasiado tarde.

Se evaluaron dos alternativas: Langfuse y Phoenix (Arize). Phoenix es
más potente para análisis avanzado de MLOps pero requiere mayor
complejidad de configuración. Langfuse es open source, self-hosteable,
tiene integración directa con n8n mediante HTTP Request, y su interfaz
es accesible para un equipo sin especialización profunda en MLOps.

## Decisión

Se utilizará Langfuse self-hosted como plataforma única de observabilidad
para todos los LLMs del sistema. Langfuse se despliega con Docker junto
a n8n y PostgreSQL. Cada vez que n8n invoca a Haiku o a Grok, agrega
un nodo HTTP Request adicional que envía la traza completa a Langfuse
incluyendo el prompt enviado, la respuesta recibida, el modelo usado,
el tiempo de respuesta y el consumo de tokens.

Langfuse opera de forma transversal y pasiva: no modifica el
comportamiento de los LLMs, no entrena los modelos, y no interviene
en el flujo de datos. Solo registra y visualiza lo que ocurre en cada
llamada.

## Consecuencias

**Beneficios:**

- Detección temprana de Data Drift cuando el MINSA cambia el formato
  de sus boletines epidemiológicos, visible en el dashboard de Langfuse
  antes de que el error llegue a PostgreSQL.
- Detección de Prompt Drift en las respuestas de Grok comparando
  respuestas históricas ante consultas similares.
- Trazabilidad completa de cada llamada a LLM: prompt, respuesta,
  costo y latencia, auditable en cualquier momento.
- Al ser self-hosted, los datos de las trazas no salen del entorno
  controlado del proyecto.

**Riesgos:**

- Si Langfuse cae, el sistema sigue funcionando porque es pasivo,
  pero se pierde la trazabilidad durante ese período.
- Agrega un nodo HTTP Request adicional en cada workflow de n8n que
  use un LLM, lo que incrementa levemente la complejidad de cada
  workflow.

**Mitigación:**

- El Arquitecto valida en cada PR que los workflows de n8n que invocan
  LLMs incluyan el nodo de envío de trazas a Langfuse.
- Langfuse se despliega con Docker y se incluye en el
  docker-compose del proyecto para garantizar su disponibilidad
  junto al resto de servicios.
