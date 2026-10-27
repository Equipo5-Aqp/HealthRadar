# ADR-006: Selección de MINSA/CDC Perú como única fuente de datos epidemiológicos

**Estado:** Aceptado (2026-08-16)  
**Relacionado con:** ADR-001, ADR-003, ADR-007  

## Contexto

HealthRadar requiere datos epidemiológicos para dos propósitos: cargar el historial de enfermedades de los últimos 20 años por distrito del Perú, y recibir datos dinámicos semanales de Dengue, EDA e IRA.

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
el PDF, Gemini 3.5 Flash Lite (ADR-003) genera un resumen epidemiológico
con marcador `[CIFRAS]`, y n8n actualiza el registro correspondiente en
`boletin_descubierto` para la semana epidemiológica detectada.

El historial por distrito no lo escribe n8n: se carga con el ETL de
`src/database/` (`limpiar_datasets_minsa.py` y `cargar_datos_minsa.py`)
en las tablas `caso_dengue`, `caso_eda`, `caso_ira_neumonia` y
`caso_ira_no_neumonia`.

La OMS e INS quedan fuera de la arquitectura como fuentes de datos
conectadas. Su único uso es como referencia documental para definir
umbrales de alerta epidemiológica, los cuales se configuran
manualmente en el sistema como parámetros fijos, no como datos
dinámicos.

## Consecuencias

**Beneficios:**

- Fuente única garantiza consistencia total del esquema de datos en
  PostgreSQL. El ETL histórico y la ingesta semanal trabajan sobre la
  misma fuente y el mismo periodo epidemiológico.
- Granularidad distrital disponible en el histórico, que es la
  granularidad necesaria para detectar brotes locales en el Perú.
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

- Arize Phoenix (ADR-010) monitorea latencia, tokens, errores y
  metadatos de cada resumen, detectando cambios de comportamiento antes
  de que el error llegue a PostgreSQL.
- `@healthradar/core` valida el resumen y el marcador `[CIFRAS]` antes
  de actualizar `boletin_descubierto`; si la validación falla, el flujo
  detiene ese boletín y lo deja para revisión.
