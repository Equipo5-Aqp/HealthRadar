# ADR-010: Adopción de Arize Phoenix Self-Hosted como plataforma de observabilidad para LLMs

**Estado:** Aceptado (2026-08-19)  
**Reemplaza a:** [ADR-005](ADR-005-langfuse-observabilidad-llms.md)  
**Relacionado con:** ADR-001, ADR-002, ADR-003, ADR-008, ADR-009, ADR-011  

## Contexto

El ADR-005 seleccionó inicialmente Langfuse para la observabilidad de LLMs (monitoreo de Data Drift en la extracción de boletines del MINSA y Prompt Drift en las consultas NLQ de analistas).

Sin embargo, durante la validación de infraestructura de despliegue (ADR-008 y ADR-011) se identificaron dos restricciones críticas de arquitectura:

1. **Fin de ciclo de soporte (EOL) de Langfuse v2:** La imagen monolítica ligera (`langfuse/langfuse:2`) alcanzó fin de soporte y actualizaciones de seguridad en el primer trimestre de 2025.
2. **Sobrecarga de recursos de Langfuse v3+:** La versión moderna de Langfuse exige una infraestructura multi-servicio compuesta por al menos 6 contenedores independientes (Web UI, Worker asíncrono, ClickHouse para analítica OLAP, Redis para colas de tareas, MinIO para almacenamiento S3 y PostgreSQL para metadata). Este despliegue requiere entre 4 y 8 GB de RAM dedicados exclusivamente a la observabilidad, excediendo la capacidad del host único de Azure (ADR-011, 4 GiB compartidos para todo el sistema).

Se evaluó **Arize Phoenix** (`arizephoenix/phoenix`) como alternativa self-hosted de grado productivo para mantener la trazabilidad completa sin saturar los recursos del host único.

## Decisión

Se adopta **Arize Phoenix Self-Hosted** como plataforma única de observabilidad para todos los LLMs del sistema (Gemini 3.5 Flash Lite para ingesta y la cadena Kimi K3 / GLM 5.3 / Gemini 3.5 Flash Lite para NLQ), reemplazando a Langfuse.

Reglas de implementación:

- **Despliegue en contenedor único:** Phoenix se ejecuta como un solo servicio Docker (`healthradar-phoenix`) dentro de la red interna `healthradar-net`.
- **Persistencia en PostgreSQL existente:** En lugar de requerir bases de datos analíticas adicionales (ClickHouse), Phoenix se conecta a la instancia de PostgreSQL ya existente (ADR-002) mediante la variable `PHOENIX_SQL_DATABASE_URL`, reutilizando la infraestructura sin costo extra de memoria.
- **Instrumentación vía n8n:** `@healthradar/core` construye el span y n8n lo envía por HTTP a `POST /v1/projects/{PHOENIX_PROJECT}/spans` con los atributos `healthradar.*` (prompt, respuesta, latencia, tokens, modelo, proveedor, sesión y metadatos RAG/cifras). No se usa el SDK de OpenTelemetry.
- **Aislamiento de red (ADR-008):** El puerto de la interfaz de Phoenix (`6006`) permanece cerrado al tráfico público por defecto y solo se expone localmente para análisis, depuración y auditoría del equipo.

## Consecuencias

**Beneficios:**

- **Consumo mínimo de recursos:** Un solo contenedor limitado a 512 MB de RAM, garantizando estabilidad del host Azure de 4 GiB junto a PostgreSQL, n8n y los microfrontends.
- **Reutilización de infraestructura:** No requiere motores OLAP adicionales (ClickHouse), colas en memoria (Redis) ni almacenamiento de objetos (MinIO); utiliza la base de datos PostgreSQL ya provisionada.
- **Compatibilidad con estándares abiertos:** Phoenix acepta OpenTelemetry (OTel); la implementación actual envía spans por HTTP desde n8n, sin SDK propietario.
- **Monitoreo de Drift y Evaluaciones:** Permite auditar Data Drift en los resúmenes de Gemini y evaluar la coherencia de las respuestas de la cadena NLQ.

**Riesgos:**

- Phoenix bajo carga muy alta de trazas continuas en PostgreSQL puede requerir mantenimiento de índices o limpieza periódica de trazas antiguas.

**Mitigación:**

- El volumen de invocaciones de HealthRadar (ingesta semanal batch y consultas NLQ de analistas) es moderado y está dentro de los rangos óptimos de operación de Phoenix con backend PostgreSQL.
- Se configura un volumen local (`phoenix_data`) para almacenamiento temporal de soporte y variables de control de sesión (`PHOENIX_SECRET`).
