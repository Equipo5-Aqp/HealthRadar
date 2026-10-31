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
El orquestador administra los flujos de `src/n8n-workflows/production/`:

1. **Ingesta Fase A — Recolección de Links (Schedule Trigger):**  
   Rastrea el portal del CDC/MINSA cada 7 días, descubre nuevos boletines y los encola en `boletin_descubierto`.
2. **Ingesta Fase B — Procesamiento de Boletín (Schedule cada 30 minutos):**
   Toma un boletín pendiente, descarga el PDF, genera un resumen con Gemini 3.5 Flash Lite (ADR-003), valida el marcador `[CIFRAS]` y actualiza `boletin_descubierto`.
3. **Clima (rama de Fase B):** consulta Open-Meteo para los 25 departamentos y hace upsert en `dato_climatico` mediante `fn_insertar_dato_climatico`.
4. **Embeddings (Schedule cada 30 minutos):** indexa los boletines con `gemini-embedding-001` (768 dimensiones) en `boletin_descubierto.embedding`.
5. **Consulta NLQ (Webhook `/webhook/consulta`):** invoca `@healthradar/core`, consulta PostgreSQL, arma el contexto RAG y usa la cadena Kimi K3 -> GLM 5.3 -> Gemini 3.5 Flash Lite; envía la traza a Phoenix (ADR-010).
6. **Webhooks auxiliares:** `tendencia`, `historicos`, `panorama`, `departamentos` y los tres de autenticación (`auth-login`, `auth-sesion`, `auth-logout`).

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
