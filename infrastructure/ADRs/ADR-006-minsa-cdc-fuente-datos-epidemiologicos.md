# ADR-006: MINSA/CDC Perú como única fuente de datos epidemiológicos

Relacionado con: ADR-001 (orquestación n8n), ADR-003 (división de LLMs)

## Contexto

HealthRadar requiere datos epidemiológicos para dos propósitos: cargar el historial de enfermedades de los últimos 20 años por distrito del Perú, y recibir datos dinámicos semanales con los casos nuevos de enfermedades de notificación obligatoria como Dengue, Influenza y Covid-19.

Se evaluaron tres fuentes candidatas: MINSA/CDC Perú, Instituto
Nacional de Salud (INS) y Organización Mundial de la Salud (OMS).

El INS publica datos epidemiológicos del Perú pero el MINSA/CDC Perú
ya los centraliza, por lo que el INS no agrega información nueva y sí
agrega el problema de un formato de datos distinto. La OMS publica
datos agregados a nivel país, sin granularidad distrital, lo que la
hace inútil para detectar brotes en distritos específicos del Perú.
Mezclar múltiples fuentes con formatos distintos genera inconsistencias
en PostgreSQL y obliga a Gemini a manejar esquemas de extracción
distintos por fuente, aumentando el riesgo de datos mal insertados.

## Decisión

Se utilizará exclusivamente el boletín epidemiológico semanal del
MINSA, elaborado por el Centro Nacional de Epidemiología, Prevención
y Control de Enfermedades (CDC Perú), como fuente de datos
epidemiológicos del sistema. Esta fuente cubre tanto la carga inicial
del historial como la ingesta dinámica semanal.

Los boletines se publican en formato PDF semanalmente. n8n descarga
el PDF, Gemini Flash (ADR-003) extrae los datos estructurados en JSON,
y n8n inserta el resultado en PostgreSQL diferenciado por fecha y semana
epidemiológica.

La OMS e INS quedan fuera de la arquitectura como fuentes de datos
conectadas. Su único uso es como referencia documental para definir
umbrales de alerta epidemiológica, los cuales se configuran
manualmente en el sistema como parámetros fijos, no como datos
dinámicos.

## Consecuencias

**Beneficios:**

- Fuente única garantiza consistencia total del esquema de datos en
  PostgreSQL. Gemini Flash siempre procesa el mismo formato de PDF.
- Granularidad distrital disponible, que es la granularidad necesaria
  para detectar brotes locales en el Perú.
- Elimina el riesgo de inconsistencias por cruce de fuentes con
  formatos distintos.
- Simplifica el workflow de ingesta en n8n a un solo tipo de documento
  a procesar.

**Riesgos:**

- Dependencia total de una sola fuente. Si el MINSA deja de publicar
  el boletín o cambia su formato, el sistema pierde su entrada de
  datos epidemiológicos.
- Los cambios de formato del PDF del MINSA generan Data Drift que
  puede romper la extracción de Gemini silenciosamente.

**Mitigación:**

- Arize Phoenix (ADR-010) monitorea cada extracción de Gemini Flash y
  alerta cuando el JSON resultante cambia de estructura, detectando
  cambios de formato del boletín antes de que el error llegue a PostgreSQL.
- Se agrega un nodo de validación de esquema JSON en n8n entre la
  extracción de Gemini y la inserción en PostgreSQL para rechazar
  datos mal formados antes de contaminar la base de datos.
