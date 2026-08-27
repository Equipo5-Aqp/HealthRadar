-- ==============================================================================
-- SCRIPT DE PRUEBA DE CONCEPTO - ADR-002: Consulta Híbrida (Tabular + Vectorial)
-- Proyecto: HealthRadar - Célula 5
--
-- ATENCIÓN: Esta consulta opera sobre [DATOS SIMULADOS DE PRUEBA / MOCK SEED DATA]
-- ==============================================================================

-- 1. Verificación de Extensión pgvector activa
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';

-- 2. Consulta Tabular: Cruce de Casos Epidemiológicos y Clima por Distrito y Semana
SELECT 
    e.distrito,
    e.enfermedad,
    e.semana_epidemiologica,
    e.ano,
    e.casos_confirmados,
    c.temp_max_promedio,
    c.precipitacion_acumulada_mm
FROM casos_epidemiologicos e
JOIN datos_climaticos c 
    ON e.distrito = c.distrito 
   AND e.semana_epidemiologica = c.semana_epidemiologica
   AND e.ano = c.ano
WHERE e.enfermedad = 'DENGUE'
ORDER BY e.casos_confirmados DESC;

-- 3. Consulta Vectorial de Búsqueda Semántica con Distancia Coseno (<=>)
-- Busca los reportes semánticamente más cercanos a un vector de prueba
WITH query_vector AS (
    SELECT array_agg(0.0105)::vector(1536) AS vec FROM generate_series(1, 1536)
)
SELECT 
    r.id,
    r.titulo,
    r.distrito,
    r.categoria,
    1 - (r.embedding <=> q.vec) AS similitud_coseno
FROM reportes_embeddings r, query_vector q
ORDER BY r.embedding <=> q.vec
LIMIT 5;
