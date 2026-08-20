# ADR-003: División de LLMs por momento de operación

## Contexto

HealthRadar requiere dos capacidades distintas de inteligencia artificial:
procesar PDFs de boletines epidemiológicos del MINSA para extraer datos
estructurados, y responder consultas en lenguaje natural de analistas de
salud pública sobre datos históricos y recientes. Usar un único modelo
para ambas tareas implica un costo mayor, riesgo de saturación de cuotas
y acopla innecesariamente dos responsabilidades con naturalezas distintas.

Se evaluaron modelos especializados para cada caso:
- Para extracción de PDFs: Se requiere alta capacidad multimodal y ventana
  de contexto amplia para leer documentos de hasta 50 páginas sin necesidad
  de OCR previo propenso a errores en tablas.
- Para consultas NLQ: Se requiere precisión de seguimiento de instrucciones,
  síntesis analítica y redacción en español para salud pública, operando sobre
  datos ya estructurados provistos por PostgreSQL.

## Decisión

Se utilizarán dos modelos de lenguaje distintos de proveedores independientes
(Google y Anthropic), cada uno operando en un momento diferente del sistema,
sin solapamiento:

- **Google Gemini Flash (Google AI Studio)** opera exclusivamente durante el
  flujo de ingesta semanal. Su responsabilidad es leer el contenido nativo
  y tablas de los PDFs de boletines epidemiológicos y devolver un JSON
  estructurado y normalizado. Opera bajo el tier gratuito permanente (Free Tier),
  garantizando costo $0 en la tarea de mayor volumen de tokens. Nunca interactúa
  con el analista ni accede directamente a PostgreSQL.

- **Claude Haiku (Anthropic)** opera exclusivamente durante el flujo de
  consulta NLQ. Su responsabilidad es recibir datos ya estructurados desde
  PostgreSQL (provistos por n8n) e interpretarlos para generar un reporte
  analítico en lenguaje natural dirigido al analista. Nunca recibe PDFs ni datos
  crudos en bruto, lo que reduce el consumo a menos de ~1,000 tokens por consulta
  y mantiene el costo operativo marginal (< $1.50/mes).

Ambos modelos son invocados únicamente desde n8n, respetando la regla
crítica de que ningún componente del sistema interactúa directamente con
una API de IA sin pasar por la capa de orquestación.

## Consecuencias

**Beneficios:**

- Optimización extrema de costos: Extracción pesada a costo $0.00 con Gemini Flash
  y consultas interactivas a costo marginal con Claude Haiku.
- Eliminación de pipelines de OCR intermedios gracias a la capacidad
  multimodal nativa de Gemini sobre PDFs.
- Separación clara de responsabilidades y desacoplamiento de cuotas de consumo.
- Diversidad de proveedores (Google + Anthropic), evitando Vendor Lock-in y
  habilitando estrategias de contingencia (fallback) en n8n.

**Riesgos:**

- Dependencia de dos proveedores distintos (Google y Anthropic). Si uno
  cambia su API o pricing, se debe actualizar el nodo correspondiente en n8n.
- Si Gemini extrae datos incorrectamente del PDF, Haiku generará reportes
  basados en datos erróneos sin saberlo.

**Mitigación:**

- Agregar un nodo de validación de esquema JSON en n8n entre la extracción
  de Gemini y la inserción en PostgreSQL.
- Monitorear la calidad de extracción y posibles derivas (Data Drift / Prompt Drift)
  utilizando Arize Phoenix (ADR-010).
