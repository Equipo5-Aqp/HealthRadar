-- ==============================================================================
-- MIGRACIÓN INICIAL - ADR-002: Base de Datos Unificada con pgvector
-- Proyecto: HealthRadar - Célula 5
-- ==============================================================================

-- 1. Habilitar extensión vectorial pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabla de Datos Epidemiológicos Estructurados (MINSA / CDC Perú)
CREATE TABLE IF NOT EXISTS casos_epidemiologicos (
    id SERIAL PRIMARY KEY,
    departamento VARCHAR(100) NOT NULL,
    provincia VARCHAR(100) NOT NULL,
    distrito VARCHAR(100) NOT NULL,
    enfermedad VARCHAR(100) NOT NULL,
    semana_epidemiologica INT NOT NULL CHECK (semana_epidemiologica BETWEEN 1 AND 53),
    ano INT NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
    casos_confirmados INT NOT NULL DEFAULT 0,
    casos_probables INT NOT NULL DEFAULT 0,
    fecha_corte DATE NOT NULL,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para optimizar consultas tabulares por ubicación, enfermedad y fecha
CREATE INDEX IF NOT EXISTS idx_casos_distrito_semana ON casos_epidemiologicos(distrito, ano, semana_epidemiologica);
CREATE INDEX IF NOT EXISTS idx_casos_enfermedad ON casos_epidemiologicos(enfermedad);

-- 3. Tabla de Datos Climáticos Estructurados (Open-Meteo)
CREATE TABLE IF NOT EXISTS datos_climaticos (
    id SERIAL PRIMARY KEY,
    distrito VARCHAR(100) NOT NULL,
    latitud NUMERIC(8, 5) NOT NULL,
    longitud NUMERIC(8, 5) NOT NULL,
    semana_epidemiologica INT NOT NULL,
    ano INT NOT NULL,
    temp_max_promedio NUMERIC(4, 2) NOT NULL,
    precipitacion_acumulada_mm NUMERIC(6, 2) NOT NULL,
    fecha_registro DATE NOT NULL,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clima_distrito_semana ON datos_climaticos(distrito, ano, semana_epidemiologica);

-- 4. Tabla de Embeddings Vectoriales para Búsqueda Semántica sobre Historial (pgvector)
-- Columna embedding de 1536 dimensiones (estándar OpenAI / Anthropic embeddings)
CREATE TABLE IF NOT EXISTS reportes_embeddings (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(255) NOT NULL,
    contenido_texto TEXT NOT NULL,
    categoria VARCHAR(100) NOT NULL,
    distrito VARCHAR(100),
    semana_epidemiologica INT,
    ano INT,
    embedding vector(1536),
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índice vectorial HNSW para búsquedas de similitud por coseno ultra-rápidas
CREATE INDEX IF NOT EXISTS idx_reportes_embedding_hnsw 
ON reportes_embeddings 
USING hnsw (embedding vector_cosine_ops);


-- ==============================================================================
-- [DATOS SIMULADOS DE PRUEBA / MOCK SEED DATA]
-- ATENCIÓN: Los siguientes registros son DATOS SINTÉTICOS Y SIMULADOS
-- que reproducen la estructura oficial del MINSA CDC Perú y Open-Meteo.
-- Se utilizan exclusivamente para validar la PoC de ADR-002 y ADR-008.
-- ==============================================================================

-- Inserción de Casos Epidemiológicos Simulados
INSERT INTO casos_epidemiologicos (departamento, provincia, distrito, enfermedad, semana_epidemiologica, ano, casos_confirmados, casos_probables, fecha_corte)
VALUES 
    ('LIMA', 'LIMA', 'SAN JUAN DE LURIGANCHO', 'DENGUE', 20, 2024, 142, 35, '2024-05-18'),
    ('LIMA', 'LIMA', 'COMAS', 'DENGUE', 20, 2024, 88, 12, '2024-05-18'),
    ('PIURA', 'PIURA', 'CASTILLA', 'DENGUE', 20, 2024, 310, 85, '2024-05-18'),
    ('LORETO', 'MAYNAS', 'IQUITOS', 'MALARIA', 20, 2024, 64, 18, '2024-05-18'),
    ('LIMA', 'LIMA', 'SAN JUAN DE LURIGANCHO', 'INFLUENZA', 20, 2024, 29, 5, '2024-05-18');

-- Inserción de Datos Climáticos Simulados
INSERT INTO datos_climaticos (distrito, latitud, longitud, semana_epidemiologica, ano, temp_max_promedio, precipitacion_acumulada_mm, fecha_registro)
VALUES 
    ('SAN JUAN DE LURIGANCHO', -11.9761, -76.9961, 20, 2024, 26.50, 1.20, '2024-05-18'),
    ('COMAS', -11.9360, -77.0420, 20, 2024, 25.80, 0.80, '2024-05-18'),
    ('CASTILLA', -5.1978, -80.6125, 20, 2024, 32.40, 14.50, '2024-05-18'),
    ('IQUITOS', -3.7491, -73.2538, 20, 2024, 31.10, 45.00, '2024-05-18');

-- Inserción de Reportes Vectorializados Simulados (Vectors con 1536 ceros/valores sintéticos)
-- NOTA: Para la PoC, el vector es un embedding sintético normalizado.
INSERT INTO reportes_embeddings (titulo, contenido_texto, categoria, distrito, semana_epidemiologica, ano, embedding)
VALUES 
    (
        '[DATOS SIMULADOS] Alerta Brote Dengue SJL SE-20 2024',
        'Incremento significativo de casos de Dengue en San Juan de Lurigancho coincidiendo con elevación de temperatura promedio a 26.5C.',
        'ALERTA_EPIDEMIOLOGICA',
        'SAN JUAN DE LURIGANCHO',
        20,
        2024,
        (SELECT array_agg(0.01)::vector(1536) FROM generate_series(1, 1536))
    ),
    (
        '[DATOS SIMULADOS] Reporte de Precipitación e Inundaciones Castilla SE-20 2024',
        'Altas precipitaciones acumuladas de 14.5mm en Castilla Piura generaron estancamiento de agua y aumento de vector Aedes Aegypti.',
        'CLIMA_Y_VECTORES',
        'CASTILLA',
        20,
        2024,
        (SELECT array_agg(0.02)::vector(1536) FROM generate_series(1, 1536))
    );
