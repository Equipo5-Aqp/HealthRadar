# ADR-002: Uso de PostgreSQL con pgvector como única base de datos

## Contexto

HealthRadar maneja dos tipos de datos con naturalezas distintas: datos
estructurados tabulares como casos de enfermedades por distrito y fecha,
y potenciales búsquedas semánticas sobre historial epidemiológico para
responder consultas en lenguaje natural. Una solución común sería usar
una base de datos relacional para los datos tabulares y una base de datos
vectorial separada para las búsquedas semánticas. Sin embargo, mantener
dos bases de datos distintas aumenta la complejidad operacional y los
puntos de falla del sistema.

## Decisión

Se utilizará PostgreSQL con la extensión pgvector como única base de
datos del sistema. PostgreSQL almacena tanto el historial epidemiológico
estructurado como los embeddings vectoriales generados a partir de los
reportes. No existe una base de datos temporal separada para los datos
recientes. Los boletines nuevos descargados semanalmente se insertan en
la misma base de datos diferenciados por fecha, conviviendo con el
historial de 20 años.

## Consecuencias

**Beneficios:**

- Un único motor de base de datos reduce la complejidad operacional y
  los puntos de falla.
- pgvector permite búsquedas semánticas sobre el historial sin necesidad
  de una base de datos vectorial externa como Pinecone o Weaviate.
- Las consultas de n8n pueden cruzar datos históricos y recientes en una
  sola query SQL con rangos de fecha.
- Menor costo de infraestructura al eliminar un servicio adicional.

**Riesgos:**

- pgvector tiene limitaciones de rendimiento comparado con bases de datos
  vectoriales especializadas para volúmenes muy grandes de embeddings.
- Si la extensión pgvector no está correctamente habilitada en la
  migración inicial, las búsquedas semánticas fallan silenciosamente.

**Mitigación:**

- Validar la habilitación de pgvector en las migraciones SQL antes de
  aprobar cualquier PR que las contenga.
- Documentar el esquema de tablas y la estrategia de indexación vectorial
  en el README.md.
