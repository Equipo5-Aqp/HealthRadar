# ADR-002: Uso de PostgreSQL con extensión pgvector como base de datos unificada

**Estado:** Aceptado (2026-08-11)  
**Relacionado con:** ADR-001, ADR-008, ADR-012  

## Contexto

HealthRadar maneja dos tipos de información con naturalezas y patrones de acceso distintos:
1. **Datos estructurados tabulares:** Registros de series de tiempo epidemiológicas (casos de Dengue, IRA, EDA por distrito, semana y año) y variables climáticas (temperatura, precipitación).
2. **Datos no estructurados y contexto semántico:** Textos explicativos, alertas sanitarias y notas metodológicas contenidas en los boletines oficiales del MINSA.

Para responder consultas complejas en lenguaje natural (NLQ), el sistema requiere recuperar tanto números exactos como fragmentos de texto contextuales mediante **RAG (Retrieval-Augmented Generation)**. La arquitectura tradicional sugiere desacoplar un motor relacional (ej. PostgreSQL o MySQL) de una base de datos vectorial especializada externa (como Pinecone, Qdrant o Weaviate).

Sin embargo, desplegar y mantener dos motores de bases de datos incrementa drásticamente la superficie de fallos, introduce latencia de sincronización y sobrepasa el presupuesto estricto de memoria de la máquina virtual (4 GB de RAM, ADR-011).

## Decisión

Se utilizará **PostgreSQL 16 con la extensión `pgvector`** como **única base de datos unificada** del sistema (`healthradar-postgres`).

### Modelo híbrido relacional y soporte RAG
- **Almacenamiento unificado:** PostgreSQL almacena el modelo relacional normalizado (tablas de distritos, casos históricos, clima y metadatos) y, de forma coexistente, las tablas de embeddings vectoriales generados a partir de los boletines procesados.
- **Capacidad de RAG Híbrido:** Permite ejecutar consultas combinadas en una única sentencia SQL: cruzar filtros relacionales estrictos (`WHERE anio = 2024 AND id_departamento = 16`) con operadores de similitud de coseno (`ORDER BY embedding <=> query_embedding LIMIT 5`) usando índices HNSW (`vector_cosine_ops`).
- **Persistencia sin duplicidad:** No existe base de datos temporal separada. Los boletines semanales nuevos descargados se insertan en las mismas tablas con su correspondiente identificador temporal, conviviendo directamente con las series históricas.
- **Límite de memoria acotado:** Se despliega en Docker con la imagen oficial `pgvector/pgvector:pg16` restringida a un `mem_limit` de **768 MB**.

## Consecuencias

**Beneficios:**

- **Arquitectura RAG sin sobrecosto de servicios:** Elimina la necesidad de contratar bases de datos vectoriales SaaS (Pinecone) o levantar contenedores pesados adicionales (Weaviate/Milvus), conservando la memoria RAM de la VM.
- **Atomicidad y consistencia transaccional:** Las consultas de n8n o scripts analíticos pueden cruzar datos tabulares exactos con contexto vectorial en una sola transacción SQL.
- **Simplicidad operativa y backups únicos:** La totalidad del estado del sistema reside en un único volumen de Docker (`postgres_data`), simplificando respaldos (`pg_dump`) y migraciones.

**Riesgos:**

- **Consumo de memoria durante indexación vectorial:** La construcción de índices HNSW o consultas vectoriales complejas de alta dimensión puede competir por la memoria compartida (`shared_buffers` y `work_mem`).
- **Riesgo de fallo silencioso si pgvector no se inicializa:** Si la extensión no se activa en la migración inicial `CREATE EXTENSION IF NOT EXISTS vector;`, las operaciones de inserción vectorial fallan.

**Mitigación:**

- La activación de `pgvector` está automatizada en la migración base `001_inicial.sql` ejecutada en `/docker-entrypoint-initdb.d/`.
- El límite de memoria de PostgreSQL está protegido en 768 MB en `docker-compose.yml`, optimizando los parámetros de conexión y acotando las dimensiones de embeddings al estándar del modelo de extracción.
