# Evaluador Crítico — Criterios de calidad de respuesta (LLM-as-a-Judge)

Versión: 1.0 · Sprint 2
Aplica a: workflow "Conexion posgrest" (webhook `/webhook/consulta`)

Nota conceptual: esta evaluación corresponde al área de **LLMOps** (evaluación
de calidad de un agente de IA en producción), un ámbito distinto pero
complementario al de DevSecOps tradicional — evaluamos comportamiento del
modelo, no solo del código que lo rodea.

## Escala de evaluación (1-5)

1. **Respuesta vacía o error filtrado** — el output está vacío, o expone un
   mensaje de error interno (ej. de n8n o del proxy) como si fuera contenido válido.
2. **Respuesta genérica sin datos reales** — el modelo responde con texto
   plausible pero no usa los datos reales inyectados (boletines/clima/tendencia).
3. **Usa datos reales pero ignora reglas de negocio** — cita cifras correctas,
   pero no advierte desfase temporal entre boletín y clima, o inventa un
   marcador de riesgo sin tendencia proporcionada.
4. **Correcto pero incompleto** — responde bien y respeta las reglas, pero
   omite información relevante disponible en el contexto (ej. no menciona
   una tendencia que sí se le proporcionó).
5. **Correcto y completo** — usa los datos reales, advierte desfases si
   corresponde, y cuando hay tendencia, emite el marcador de riesgo con
   justificación coherente en el texto.

## Casos de evaluación manual

| # | Pregunta representativa | Respuesta esperada |
|---|---|---|
| 1 | "¿Cuántos casos de dengue hubo en Arequipa en marzo de 2024?" | Activa predicción (año ≤2024, departamento detectado). Debe traer tendencia de Postgres filtrada a Arequipa/dengue, y terminar con `[NIVEL_RIESGO: X]` |
| 2 | "¿Qué pasó con el dengue la semana pasada?" | Sin departamento, sin año ≤2024 → usa boletines recientes (Fase B), sin marcador de riesgo (no hay tendencia histórica involucrada) |
| 3 | "¿Hay datos de dengue en el distrito de Marte?" | Debe declarar explícitamente que no tiene esa información — anti-alucinación (mismo criterio que HU-06 Sprint 1) |
| 4 | Pregunta que cruza boletín (2026) y clima de otra semana | Debe advertir explícitamente el desfase temporal antes de responder |
| 5 | "¿Cuántos casos de EDA hubo en 2023?" (sin departamento) | Activa predicción a nivel **nacional** (25 departamentos sumados) — no debe pedir que se especifique un departamento |

## Relación con el marcador de riesgo (validación técnica, no solo semántica)

Además de la evaluación cualitativa de arriba, existe un chequeo estructural
verificable por código (no requiere juicio humano): cuando `activar_prediccion = true`
en la respuesta del backend, el campo `nivel_riesgo` (extraído por el nodo
`Extraer y limpiar nivel de riesgo`) debe venir en `{alto, medio, bajo}`, nunca
`null`. Cuando no hay tendencia, `nivel_riesgo` debe ser `null` — un valor
inventado en ese caso sería una violación directa de la regla del prompt.
Este chequeo es candidato natural para HU-10/HU-11 en lugar de evaluación manual.