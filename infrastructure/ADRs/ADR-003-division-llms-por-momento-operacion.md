# ADR-003: Selección y división de LLMs por momento de operación (Gemini Flash y NVIDIA Kimi/GLM con failover)

**Estado:** Aceptado (2026-08-12)  
**Relacionado con:** ADR-001, ADR-006, ADR-010, ADR-012  

## Contexto

HealthRadar requiere dos capacidades de inteligencia artificial con perfiles operativos muy distintos:
1. **Extracción pesada multimodal de boletines (Fase Ingesta):** Procesar documentos PDF de hasta 50 páginas del MINSA para extraer tablas y texto epidemiológico sin OCR intermedio propenso a errores. Es un proceso por lotes (batch), predecible en frecuencia pero con alta densidad de tokens de entrada.
2. **Síntesis interactiva NLQ (Fase Consulta):** Responder consultas en lenguaje natural de analistas sobre datos estructurados ya extraídos. Es un flujo interactivo en tiempo real con alta variabilidad de tráfico, sensible a latencia y susceptible a agotar cuotas (Rate Limits por minuto o por día).

Utilizar un único proveedor o modelo para ambas tareas concentra el riesgo de fallos, agota rápidamente las cuotas y eleva los costos operativos.

## Decisión

Se adopta una **estrategia multi-modelo y multi-proveedor desacoplada por momento de operación**, orquestada exclusivamente desde n8n:

### 1. Ingesta de Boletines — Google Gemini Flash con Rotación de 3 Cuentas
- **Proveedor:** Google AI Studio (Gemini Flash).
- **Rol:** Lectura nativa multimodal de PDFs epidemiológicos y generación de JSON estructurado normalizado.
- **Estrategia de respaldo:** Se configuran **3 API keys independientes** inyectadas por variables de entorno (`GEMINI_API_KEY`, `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`).
- **Comportamiento:** Si una clave alcanza el límite de solicitudes por minuto o día, el flujo de n8n conmuta automáticamente a la siguiente clave mediante la lógica de failover en `@healthradar/core`. Dado que la ingesta ocurre semanalmente en lotes acotados, esta estrategia garantiza un costo de **$0.00** sin interrupciones por cuota.

### 2. Consulta NLQ — NVIDIA API (Kimi / GLM) con Failover a Gemini
- **Proveedor principal:** **NVIDIA API** (`NVIDIA_API_KEY`, `NVIDIA_API_KEY_KIMI`).
- **Modelos seleccionados:** Modelos de alto rendimiento y bajo costo disponibles en la plataforma como **Kimi (Moonshot Kimi K3)** y **GLM (GLM-4 / GLM-5-3)**.
- **Rol:** Recibir la consulta del analista junto al contexto depurado de PostgreSQL, deducir la intención epidemiológica, sintetizar análisis y redactar reportes ejecutivos en español.
- **Failover automático:** Si la API de NVIDIA experimenta indisponibilidad, error 429 o saturación, el workflow de consulta conmuta de inmediato hacia las **3 claves de Google Gemini Flash** como respaldo de continuidad operativa.

Ningún modelo es invocado directamente desde el navegador; todas las llamadas son privadas y mediadas por n8n (ADR-001) y auditadas en Arize Phoenix (ADR-010).

## Consecuencias

**Beneficios:**

- **Costo operativo marginal y resiliencia:** Extracción pesada gratuita mediante la rotación de 3 cuentas Gemini, combinada con inferencia ágil para NLQ vía NVIDIA.
- **Continuidad de servicio (Cero caídas por proveedor):** La conmutación automática entre NVIDIA y las 3 cuentas de Google asegura que una caída de API externa no bloquee a los analistas.
- **Independencia de proveedores (Anti Vendor Lock-in):** Permite cambiar modelos o endpoints sin refactorizar la lógica central del sistema.

**Riesgos:**

- **Agotamiento acelerado de cuotas en NLQ:** A diferencia de la ingesta, el asistente NLQ es interactivo y continuo. Múltiples analistas consultando en paralelo pueden consumir rápidamente las cuotas de tokens por minuto o agotar créditos en NVIDIA.
- **Discrepancia de formato entre modelos:** Respuestas de modelos distintos (Kimi vs Gemini) pueden diferir en el seguimiento de esquemas JSON si no están fuertemente validados.

**Mitigación:**

- **Integración de Contingencia vía OpenCode / OpenRouter:** Como vía de mitigación arquitectónica ante saturación extrema de cuotas en NLQ, el sistema contempla el uso de proveedores agregadores como **OpenCode u OpenRouter** (habilitando modelos alternativos como DeepSeek, Qwen o Nous Research) bajo la misma interfaz estándar compatible con OpenAI.
- **Normalización estricta de salidas:** La biblioteca `@healthradar/core` implementa un validador de contratos (shape-check) sobre las respuestas de los LLMs antes de retornarlas al frontend, asegurando una estructura uniforme sin importar qué modelo respondió la consulta.
- **Monitoreo de Drift y Tokens:** Arize Phoenix (ADR-010) audita la latencia, consumo de tokens y tasa de fallos de cada proveedor en tiempo real.
