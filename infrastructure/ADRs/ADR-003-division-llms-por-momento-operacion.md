# ADR-003: División de LLMs por momento de operación

## Contexto

HealthRadar requiere dos capacidades distintas de inteligencia artificial:
procesar PDFs de boletines epidemiológicos del MINSA para extraer datos
estructurados, y responder consultas en lenguaje natural de analistas de
salud pública sobre datos históricos y recientes. Usar un único modelo
para ambas tareas implica un costo mayor y acopla innecesariamente dos
responsabilidades con naturalezas distintas. Adicionalmente, modelos como
Grok no están optimizados para extracción de documentos no estructurados,
y modelos multimodales más capaces tienen un costo por token más alto para
tareas de generación de texto simple.

## Decisión

Se utilizarán dos modelos de lenguaje distintos, cada uno operando en un
momento diferente del sistema, sin solapamiento:

- **Claude Haiku 4.5 (Anthropic)** opera exclusivamente durante el flujo
  de ingesta semanal. Su única responsabilidad es leer el contenido
  extraído de los PDFs de boletines epidemiológicos y devolver un JSON
  estructurado con los datos normalizados. Nunca interactúa con el
  analista ni accede directamente a PostgreSQL.

- **Grok (xAI)** opera exclusivamente durante el flujo de consulta NLQ.
  Su única responsabilidad es recibir datos ya estructurados desde
  PostgreSQL (provistos por n8n) e interpretarlos para generar un reporte
  en lenguaje natural dirigido al analista. Nunca recibe PDFs ni datos
  en bruto.

Ambos modelos son invocados únicamente desde n8n, respetando la regla
crítica de que ningún componente del sistema interactúa directamente con
una API de IA sin pasar por la capa de orquestación.

## Consecuencias

**Beneficios:**

- Reducción de costos al usar cada modelo solo para la tarea en que es
  más eficiente.
- Separación clara de responsabilidades entre extracción e interpretación.
- Grok nunca recibe datos en bruto ni documentos no estructurados, lo que
  reduce el riesgo de respuestas imprecisas por contexto mal formateado.
- El sistema es independiente por capas: cambiar un modelo no afecta al
  otro.

**Riesgos:**

- Dependencia de dos proveedores distintos (Anthropic y xAI). Si uno
  cambia su API o pricing, se debe actualizar el nodo correspondiente
  en n8n.
- Si Haiku extrae datos incorrectamente del PDF, Grok generará reportes
  basados en datos erróneos sin saberlo. Se requiere validación del JSON
  extraído antes de insertarlo en PostgreSQL.

**Mitigación:**

- Agregar un nodo de validación de esquema JSON en n8n entre la extracción
  de Haiku y la inserción en PostgreSQL.
- Monitorear la calidad de extracción con Langfuse para detectar
  degradación cuando el MINSA cambie el formato de sus boletines
  (Data Drift).
