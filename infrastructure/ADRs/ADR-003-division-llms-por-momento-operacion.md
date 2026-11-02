# ADR-003: Selección y división de LLMs por momento de operación (Gemini 3.5 Flash Lite y NVIDIA Kimi/GLM con failover)

**Estado:** Aceptado (2026-08-12). Revisado con datos de operación el 2026-11-02 (S4-HU-06).  
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

## Revisión con datos de operación (S4-HU-06, 2026-11-02)

Esta sección no cambia la decisión: registra el comportamiento observado en Arize Phoenix para contrastarlo con lo previsto. Datos: 272 spans del proyecto `default` entre el 2026-10-12 y el 2026-11-02.

### Consumo y latencia observados

| Traza | Spans | Errores | Latencia p50 / p95 / máx | Tokens p50 / p95 / máx | Modelo(s) |
|---|---|---|---|---|---|
| `nlq.consulta` | 89 | 0 | 48,3 / 94,4 / 98,2 s | 6.500 / 28.717 / 30.571 | Gemini 3.5 Flash Lite (60), GLM 5.3 (15), Kimi K3 (14) |
| `boletin.reproceso` | 101 | 20 | 2,9 / 7,6 / 80,7 s | 14.679 / 29.313 / 33.384 | Gemini 3.5 Flash Lite |
| `boletin.resumen` | 1 | 0 | 2,9 s | 15.537 | Gemini 3.5 Flash Lite |
| `boletin.embedding` | 81 | 0 | 0,3 / 0,5 / 1,8 s | 18 / 18 / 20 | gemini-embedding-001 |

Detalle de `nlq.consulta` por modelo:

| Modelo | Consultas | Latencia p50 / p95 | Tokens p50 / p95 |
|---|---|---|---|
| Gemini 3.5 Flash Lite (respaldo final) | 60 (67 %) | 49,2 / 94,4 s | 4.778 / 21.342 |
| GLM 5.3 | 15 (17 %) | 39,2 / 71,7 s | 3.035 / 26.900 |
| Kimi K3 (primera opción) | 14 (16 %) | 28,8 / 43,6 s | 28.399 / 30.311 |

### Diferencias con lo previsto

- **La cadena de failover se usa al revés de lo esperado.** Gemini, último eslabón de la cadena Kimi K3 → GLM 5.3 → Gemini, respondió el 67 % de las consultas NLQ. Las trazas solo registran el modelo que respondió, no los intentos fallidos, por lo que no se sabe si Kimi y GLM fallaron por cuota, por error o por respuesta vacía.
- **Latencia.** El 12 % de las consultas NLQ (11 de 89) superó los 60 s en que nginx corta la conexión, por lo que el usuario recibió un error 504 aunque la consulta terminara bien en n8n. Gemini, como respaldo, es el más lento; Kimi es el más rápido.
- **Tokens.** Una versión anterior de este ADR estimaba menos de ~1.000 tokens por consulta; el valor observado es de 6.500 en la mediana y hasta 30.571 tokens.
- **Errores de la ingesta.** Los 20 errores de `boletin.reproceso` son rechazos del validador de cifras ("Resumen inconsistente"): el control de calidad del resumen funciona y detecta cifras que no aparecen en el boletín o acumulados que disminuyen.
- **Muestra.** 67 de las 89 consultas NLQ son de la semana 2026-S42 (pruebas de QA). Los valores deben recalcularse con uso real.

### Costo

Por decisión del equipo, el proyecto no debe generar gasto en modelos. Por eso no se configura precio por modelo en Phoenix; el riesgo a vigilar es el agotamiento de cuotas, que se cubre con los umbrales de tokens del workflow de alertas de Phoenix.

### Acciones propuestas (a decidir por el Arquitecto)

1. Registrar en Phoenix o en los logs de n8n los intentos fallidos de cada modelo de la cadena, para conocer por qué Kimi y GLM no responden en la mayoría de las consultas.
2. Revisar el orden o los tiempos de espera de la cadena de failover, dado que la mayoría de las respuestas proviene del modelo más lento.
3. Alinear el tiempo de espera de nginx con la latencia observada, o reducir la latencia de la consulta, para eliminar los errores 504.
4. Recalcular estos valores cuando exista uso real del sistema.