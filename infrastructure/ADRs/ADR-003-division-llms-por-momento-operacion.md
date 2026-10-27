# ADR-003: Selección y división de LLMs por momento de operación (Gemini 3.5 Flash Lite y NVIDIA Kimi/GLM con failover)

**Estado:** Aceptado (2026-08-12)  
**Relacionado con:** ADR-001, ADR-006, ADR-010, ADR-012  

## Contexto

HealthRadar requiere dos capacidades de inteligencia artificial con perfiles operativos muy distintos:
1. **Procesamiento multimodal de boletines (Fase Ingesta):** Procesar documentos PDF de hasta 50 páginas del MINSA para generar un resumen epidemiológico con cifras verificables. Es un proceso por lotes (batch), predecible en frecuencia pero con alta densidad de tokens de entrada.
2. **Síntesis interactiva NLQ (Fase Consulta):** Responder consultas en lenguaje natural de analistas sobre datos estructurados ya extraídos. Es un flujo interactivo en tiempo real con alta variabilidad de tráfico, sensible a latencia y susceptible a agotar cuotas (Rate Limits por minuto o por día).

Utilizar un único proveedor o modelo para ambas tareas concentra el riesgo de fallos, agota rápidamente las cuotas y eleva los costos operativos.

## Decisión

Se adopta una **estrategia multi-modelo y multi-proveedor desacoplada por momento de operación**, orquestada exclusivamente desde n8n:

### 1. Ingesta de Boletines — Gemini 3.5 Flash Lite con Rotación de 3 Cuentas
- **Proveedor:** Google AI Studio.
- **Modelo:** `gemini-3.5-flash-lite`.
- **Rol:** Lectura nativa multimodal de PDFs epidemiológicos y generación de un resumen validado con marcador `[CIFRAS]`.
- **Estrategia de respaldo:** Se configuran **3 API keys independientes** inyectadas por variables de entorno (`GEMINI_API_KEY`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`).
- **Comportamiento:** Si una clave alcanza el límite de solicitudes por minuto o día, el flujo de n8n conmuta automáticamente a la siguiente clave mediante la lógica de failover en `@healthradar/core`. Dado que la ingesta ocurre semanalmente en lotes acotados, esta estrategia garantiza un costo de **$0.00** sin interrupciones por cuota.

### 2. Consulta NLQ — NVIDIA API (Kimi / GLM) con Failover a Gemini
- **Proveedor principal:** **NVIDIA API** (`NVIDIA_API_KEY`, `NVIDIA_API_KEY_KIMI`).
- **Modelos seleccionados:** **Kimi K3** (`moonshotai/kimi-k3`) y **GLM 5.3** (`z-ai/glm-5.3`).
- **Rol:** Recibir la consulta del analista junto al contexto depurado de PostgreSQL, deducir la intención epidemiológica, sintetizar análisis y redactar reportes ejecutivos en español.
- **Failover automático:** La cadena es Kimi K3 -> GLM 5.3 -> Gemini 3.5 Flash Lite (dos nodos de respaldo). Si un proveedor falla o responde vacío, el siguiente agente continúa.

Ningún modelo es invocado directamente desde el navegador; todas las llamadas son privadas y mediadas por n8n (ADR-001) y auditadas en Arize Phoenix (ADR-010).

## Consecuencias

**Beneficios:**

- **Costo operativo marginal y resiliencia:** Extracción pesada gratuita mediante la rotación de 3 cuentas Gemini, combinada con inferencia ágil para NLQ vía NVIDIA.
- **Continuidad de servicio (Cero caídas por proveedor):** La conmutación automática entre NVIDIA y las 3 cuentas de Google asegura que una caída de API externa no bloquee a los analistas.
- **Independencia de proveedores (Anti Vendor Lock-in):** Permite cambiar modelos o endpoints sin refactorizar la lógica central del sistema.

**Riesgos:**

- **Agotamiento acelerado de cuotas en NLQ:** A diferencia de la ingesta, el asistente NLQ es interactivo y continuo. Múltiples analistas consultando en paralelo pueden consumir rápidamente las cuotas de tokens por minuto o agotar créditos en NVIDIA.
- **Discrepancia de formato entre modelos:** Respuestas de modelos distintos (Kimi vs GLM vs Gemini) pueden diferir en estructura y tono si no están fuertemente validadas.

**Mitigación:**

- **Contingencia futura vía agregadores:** OpenRouter/OpenCode no están implementados. Si se llegara a saturar la cuota de NVIDIA, se evaluaría un agregador compatible con OpenAI; cualquier implementación requiere su propio ADR y variables de entorno.
- **Normalización estricta de salidas:** La biblioteca `@healthradar/core` implementa un validador de contratos (shape-check) sobre las respuestas de los LLMs antes de retornarlas al frontend, asegurando una estructura uniforme sin importar qué modelo respondió la consulta.
- **Monitoreo de Drift y Tokens:** Arize Phoenix (ADR-010) audita la latencia, consumo de tokens y tasa de fallos de cada proveedor en tiempo real.
