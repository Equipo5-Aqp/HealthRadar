# ADR-001: Uso de n8n Self-Hosted como única capa de orquestación

**Estado:** Aceptado (2026-08-10)  
**Relacionado con:** ADR-002, ADR-003, ADR-004, ADR-008, ADR-012  

## Contexto

HealthRadar requiere automatizar la recolección periódica de reportes epidemiológicos y datos climáticos, coordinar el procesamiento de documentos con modelos de lenguaje, y responder consultas interactivas en lenguaje natural de analistas de salud pública. Este flujo involucra múltiples integraciones con APIs externas, triggers programados y webhooks en tiempo real.

Construir estos conductos de transporte manualmente en código disperso aumentaría la complejidad de mantenimiento e impediría la trazabilidad visual de los flujos. Asimismo, delegar la lógica de negocio a herramientas externas o servicios gestionados en la nube (n8n Cloud) violaría el requisito de soberanía de datos y despliegue self-hosted de la cátedra.

Por tanto, se requiere un motor de orquestación local desacoplado de la lógica de decisiones de dominio, permitiendo que el sistema opere de forma modular y auditable.

## Decisión

Se utilizará **n8n Self-Hosted** como **única capa de orquestación y transporte de datos** del sistema.

### Límites de responsabilidad de n8n
- **Motor de orquestación puro:** n8n actúa exclusivamente como el conducto por donde circulan los datos. Gestiona disparadores (cronjobs y webhooks), llamadas HTTP externas y conectores hacia PostgreSQL.
- **Sin lógica de negocio interna:** En concordancia con ADR-012, n8n **no contiene reglas de dominio complejas hardcodeadas en sus nodos**. La lógica de decisión, inferencia de periodos, armado de consultas y cálculo epidemiológico reside en la biblioteca del repositorio `@healthradar/core` (`src/core/`), la cual n8n embebe e invoca desde sus nodos Code (`require('@healthradar/core')`).

### Flujos de producción implementados
El orquestador administra cuatro flujos principales en el entorno de producción (`src/n8n-workflows/production/`):

1. **Ingesta Fase A — Recolección de Links (Schedule Trigger):**  
   Rastrea el portal del CDC/MINSA, descubre nuevos boletines epidemiológicos publicados y encola los registros pendientes en la tabla `boletin_descubierto` de PostgreSQL.
2. **Ingesta Fase B — Procesamiento de Boletín (Schedule / Subflujo):**  
   Toma un boletín pendiente de la cola, descarga el archivo PDF oficial, coordina la extracción estructurada con Gemini Flash (ADR-003) e inserta los registros depurados en las tablas epidemiológicas.
3. **Consulta NLQ — Asistente de Lenguaje Natural (Webhook Trigger):**  
   Expone el endpoint `/webhook/consulta` consumido por el frontend. Invoca a `@healthradar/core` para normalizar la pregunta, consulta datos en PostgreSQL, solicita la síntesis analítica al LLM (NVIDIA / Gemini) y entrega la respuesta final al usuario.
4. **Datos Históricos y Casos por Departamento (Webhook Trigger):**  
   Expone endpoints auxiliares (`/webhook/historicos`) para alimentar las vistas tabulares y mapas del frontend con paginación y filtros estructurados.

## Consecuencias

**Beneficios:**

- **Desacoplamiento arquitectónico:** n8n funciona como el motor de ejecución; modificar una regla de negocio se resuelve testeando `@healthradar/core` en Git sin reconstruir flujos desde cero.
- **Trazabilidad visual y observabilidad:** Cada ejecución de ingesta y consulta es inspeccionable visualmente en el panel de n8n y monitoreada por Arize Phoenix (ADR-010).
- **Control de versiones:** Los workflows se exportan e integran como archivos JSON en el repositorio (`src/n8n-workflows/`), sujetos a revisión por Pull Request.
- **Aislamiento de red:** Opera dentro de la red interna de Docker (`healthradar-net`), sin exponer webhooks a internet abierto.

**Riesgos:**

- **Punto único de paso (SPOF operativo):** Si el contenedor de n8n se detiene, se interrumpe la ingesta y la respuesta a consultas interactivas.
- **Consumo de memoria de Node.js:** La ejecución de workflows con manipulación de payloads JSON grandes puede incrementar la memoria del proceso V8.

**Mitigación:**

- Se asigna un límite de memoria estricto de **1,536 MB** (`mem_limit` y `memswap_limit`) en `docker-compose.yml`, con política de reinicio automático `restart: unless-stopped`.
- La lógica pesada de procesamiento se delega a funciones puras optimizadas en `@healthradar/core` y a consultas SQL indexadas en PostgreSQL, evitando transformaciones innecesarias en nodos n8n.
- Los JSONs de workflows se auditan mediante pipelines de CI/CD para impedir credenciales quemadas en texto plano.
