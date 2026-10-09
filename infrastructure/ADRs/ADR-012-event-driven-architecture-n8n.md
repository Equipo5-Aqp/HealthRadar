# ADR-012: Arquitectura Basada en Eventos (EDA) para la Orquestación Backend en n8n con Núcleo de Dominio Desacoplado

**Estado:** Aceptado (2026-09-23)  
**Relacionado con:** ADR-001, ADR-002, ADR-003, ADR-004, ADR-008, ADR-010, ADR-011, ADR-013  
**Refina a:** ADR-001 (delimita el rol reactivo de n8n frente a la lógica de negocio)

## Contexto

El sistema HealthRadar creció y la interacción del analista de salud pública con la plataforma requería desacoplar la capa de presentación de la ejecución de procesos complejos. Inicialmente, las peticiones se concebían como llamadas directas y monolíticas, concentrando en el backend múltiples responsabilidades:
- Detección de periodo, departamento y enfermedad ante consultas en lenguaje natural (NLQ).
- Ingesta y procesamiento asíncrono de boletines epidemiológicos y datos climáticos.
- Ejecución de inferencia analítica con conmutación por error (failover) entre modelos LLM.

La cátedra y las directrices arquitectónicas exigen implementar un estilo de **Arquitectura Basada en Eventos (EDA)** en el backend: cada acción realizada por el analista en la plataforma web debe responder a un evento de dominio capturado y procesado por flujos especializados de n8n.

A su vez, persistía un desafío técnico fundamental: el workflow NLQ llegó a concentrar 28 nodos en JSON, mezclando la orquestación de eventos con reglas de dominio complejas (cálculo de riesgo, ventanas epidemiológicas, failover de modelos) sin cobertura de pruebas unitarias. Se requería un mecanismo para que los eventos fuesen gestionados reactivamente por n8n pero sin convertir sus nodos en un repositorio desgobernado de lógica de negocio, y todo bajo la estricta restricción de recursos del host Azure de 4 GiB de RAM (ADR-011).

## Decisión

Se adopta formalmente una **Arquitectura Basada en Eventos (Event-Driven Architecture - EDA)** para el backend, estructurada bajo los siguientes principios:

### 1. n8n como Motor Orquestador Basado en Eventos (Event-Driven Orchestrator)
n8n actúa como el centro de recepción, enrutamiento y procesamiento reactivo de eventos del sistema:
- **Eventos de Interacción de Usuario:** Cada interacción del analista en los microfrontends dispara un evento específico que es escuchado por un Webhook Trigger dedicado en n8n:
  - Evento `QueryRequested` (`/webhook/consulta`): Disparado cuando el analista formula una pregunta en lenguaje natural.
  - Evento `TrendRequested` (`/webhook/tendencia`): Disparado para inferir proyecciones y tendencias epidemiológicas.
  - Evento `HistoricalFiltered` (`/webhook/historicos`): Disparado para consultar y filtrar cortes históricos de datos.
- **Eventos Temporales (Scheduled Events):** Procesos batch gobernados por eventos de tiempo mediante Cron Triggers:
  - Evento `EpidemiologicalWeekClosed`: Dispara la detección y descarga automática de nuevos boletines epidemiológicos del MINSA/CDC (Fase A) y datos climáticos de Open-Meteo.
  - Evento `IngestionBatchTriggered`: Dispara el procesamiento, extracción multimodal e inserción analítica de los boletines pendientes (Fase B).

### 2. Capa de Aplicación y Dominio Desacoplada: Biblioteca `@healthradar/core`
Para evitar acoplar las reglas de negocio al motor de eventos:
- n8n **no contiene lógica de dominio hardcodeada**. Su función es capturar el evento, coordinar el flujo y delegar las decisiones analíticas a la biblioteca interna **`@healthradar/core`** (`src/core/`).
- Esta biblioteca es Node.js puro, modular y 100% testeable mediante pruebas unitarias en el pipeline de CI/CD.
- Se encarga de:
  - Normalización y resolución de entidades epidemiológicas en las consultas.
  - Reglas de ventanas temporales y umbrales de alerta sanitaria.
  - Lógica de selección y failover entre proveedores de LLM.
- **Mecanismo de ejecución y zero overhead de memoria:** `@healthradar/core` se compila e inyecta directamente dentro de la imagen de Docker de n8n mediante `NODE_FUNCTION_ALLOW_EXTERNAL=@healthradar/core`. No se añade ningún contenedor ni proceso HTTP adicional, respetando el límite asignado a n8n en `docker-compose.yml` (ADR-008).

### 3. Contratos de Eventos Desacoplados
Cada flujo reactivo se rige por contratos JSON estrictos y versionados entre los emisores de eventos (BFF de los microfrontends) y los receptores en n8n, garantizando la independencia y trazabilidad de cada transición.

## Consecuencias

**Beneficios:**
- **Modelo Reactivo Consistente:** Cada interacción del usuario y cada ciclo temporal opera como un evento autónomo y trazable dentro de n8n.
- **Desacoplamiento Operativo:** El frontend no conoce cómo se ejecutan las consultas ni los modelos de IA; únicamente publica eventos hacia los webhooks del orquestador.
- **Mantenibilidad y Calidad:** La lógica de negocio abandona los nodos visuales y pasa a `@healthradar/core`, permitiendo testing unitario automatizado antes de desplegar flujos.
- **Eficiencia de Recursos:** Se logra una arquitectura orientada a eventos completa dentro del contenedor de n8n sin el consumo de memoria que requeriría un bus externo pesado.

**Riesgos:**
- Si un contrato de evento se modifica sin sincronizar n8n y `@healthradar/core`, el flujo reactivo puede interrumpirse.
- Crecimiento desmedido en la concurrencia de eventos en un único contenedor n8n.

**Mitigación:**
- Versionado estricto de los esquemas JSON de los contratos de eventos.
- Monitoreo continuo del procesamiento de trazas y latencias de cada evento en Arize Phoenix (ADR-010).
