# ADR-007: Open-Meteo como fuente de datos climáticos históricos y semanales

Relacionado con: ADR-001 (orquestación n8n), ADR-003 (división de LLMs)

## Contexto

HealthRadar requiere datos climáticos de temperatura y precipitación
por distrito del Perú para dos propósitos: cargar el historial
climático que correlaciona con el historial epidemiológico de 20 años,
y recibir datos climáticos actualizados semanalmente para cruzarlos
con los nuevos boletines del MINSA.

SENAMHI es la fuente oficial de datos climáticos del Perú y fue
evaluada como primera opción. Sin embargo, su portal de descarga
requiere cuenta con DNI peruano y resolución de CAPTCHA, lo que hace
técnicamente inviable la automatización desde n8n. Intentar romper
el CAPTCHA de una entidad gubernamental peruana tiene implicaciones
legales inaceptables para el proyecto.

El Observatorio de Clima y Salud de la DGE, que combinaba datos
epidemiológicos y climáticos por distrito, fue evaluado pero se
encuentra fuera de servicio al momento de esta decisión.

Open-Meteo es una API REST abierta, gratuita para uso no comercial,
sin requerir cuenta ni API key, que agrega modelos meteorológicos de
más de 30 servicios nacionales del mundo incluyendo ECMWF, NOAA GFS
y otros. Provee datos históricos desde 1940 mediante ERA5 reanalysis
y datos actualizados diariamente, consultables por coordenadas
geográficas.

## Decisión

Se utilizará Open-Meteo como fuente única de datos climáticos del
sistema, tanto para la carga histórica inicial como para la ingesta
dinámica semanal. Los datos se consultan por coordenadas geográficas
de cada distrito del Perú.

Para optimizar el número de requests, Open-Meteo permite enviar
múltiples pares de coordenadas en un solo request. El workflow de
ingesta en n8n agrupa los distritos en lotes y realiza un número
reducido de requests en lugar de uno por cada uno de los 1,838
distritos del Perú, manteniéndose dentro del límite gratuito de
10,000 requests diarios de Open-Meteo.

Los datos que se extraen por distrito son temperatura máxima diaria
y precipitación acumulada diaria. n8n los agrega semanalmente antes
de insertarlos en PostgreSQL, alineando la granularidad temporal
con la de los boletines epidemiológicos del MINSA que también son
semanales.

SENAMHI se mantiene como referencia oficial peruana para validación
puntual manual cuando el equipo lo requiera, pero no forma parte
del flujo automatizado.

## Consecuencias

**Beneficios:**

- Automatización completa sin intervención humana. n8n consulta
  Open-Meteo con un HTTP Request simple sin autenticación.
- Historial desde 1940 disponible para la carga inicial, suficiente
  para los 20 años de historial que requiere el sistema.
- Datos diarios agregables a semana epidemiológica, alineados con
  el ciclo de actualización del MINSA.
- Gratuito para uso no comercial, sin costos adicionales de
  infraestructura.

**Riesgos:**

- Open-Meteo no es una fuente oficial peruana. Su resolución para
  Perú es de 9 a 11 km, que puede no capturar variaciones climáticas
  muy locales en zonas andinas o amazónicas con alta variabilidad
  geográfica.
- Dependencia de un servicio externo gratuito. Si Open-Meteo cambia
  su política de uso gratuito, el sistema requiere migrar a otra
  fuente climática.

**Mitigación:**

- La resolución de 9 a 11 km es suficiente para correlaciones
  epidemiológicas a nivel distrital en zonas costeras y de sierra
  baja donde se concentran los principales brotes de Dengue en Perú.
- En el ADR se documenta SENAMHI como fuente de migración prioritaria
  si Open-Meteo deja de estar disponible, en caso de que SENAMHI
  habilite acceso programático en el futuro.
- Arize Phoenix (ADR-010) monitorea la latencia y trazabilidad de las
  respuestas de Open-Meteo mediante n8n para alertar si la estructura
  del JSON cambia inesperadamente.
