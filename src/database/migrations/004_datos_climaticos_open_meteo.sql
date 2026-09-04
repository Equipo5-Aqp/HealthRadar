-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN 004 — Datos Climáticos de Open-Meteo por Departamento (3NF)
-- Proyecto  : HealthRadar — Célula 5
-- Fecha     : 2026-09-02
-- Precondición: Migración 002 aplicada (tablas departamento y periodo_epidemiologico deben existir).
-- ─────────────────────────────────────────────────────────────────────────────

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PASO 1 — Extender departamento con coordenadas: lat/lon dependen funcionalmente solo del            ║
-- ║  departamento, por eso van en esta tabla y no en dato_climatico.         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
ALTER TABLE departamento
    ADD COLUMN IF NOT EXISTS latitud  NUMERIC(8, 5),   -- Latitud del centroide (Open-Meteo)
    ADD COLUMN IF NOT EXISTS longitud NUMERIC(8, 5);   -- Longitud del centroide (Open-Meteo)

COMMENT ON COLUMN departamento.latitud  IS 'Latitud del centroide departamental para consulta a Open-Meteo.';
COMMENT ON COLUMN departamento.longitud IS 'Longitud del centroide departamental para consulta a Open-Meteo.';

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PASO 2 — Tabla de mediciones climáticas semanales por departamento     ║
-- ║  Granularidad: 1 fila = 1 departamento × 1 semana epidemiológica        ║
-- ║  Todas las métricas dependen solo de la PK compuesta → 3NF ✓            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS dato_climatico (
    id_dato_climatico    BIGSERIAL    PRIMARY KEY,
    id_departamento      CHAR(2)      NOT NULL REFERENCES departamento(id_departamento),
    id_periodo           INT          NOT NULL REFERENCES periodo_epidemiologico(id_periodo),
    temp_max_promedio    NUMERIC(5, 2),    -- °C  — máxima diaria promediada en la semana
    temp_min_promedio    NUMERIC(5, 2),    -- °C  — mínima diaria promediada en la semana
    temp_mean_promedio   NUMERIC(5, 2),    -- °C  — media diaria promediada en la semana
    precipitacion_total  NUMERIC(7, 2),   -- mm  — acumulado de precipitación en la semana
    humedad_promedio     NUMERIC(5, 2),    -- %   — humedad relativa promedio semanal

    UNIQUE (id_departamento, id_periodo)  -- Un registro por departamento por semana
);

COMMENT ON TABLE dato_climatico IS
    'Mediciones climáticas semanales por departamento, obtenidas de la API Open-Meteo. '
    'La semana corresponde a la semana epidemiológica del MINSA.';

COMMENT ON COLUMN dato_climatico.temp_max_promedio   IS 'Promedio semanal de la temperatura máxima diaria (°C).';
COMMENT ON COLUMN dato_climatico.temp_min_promedio   IS 'Promedio semanal de la temperatura mínima diaria (°C).';
COMMENT ON COLUMN dato_climatico.temp_mean_promedio  IS 'Promedio semanal de la temperatura media diaria (°C).';
COMMENT ON COLUMN dato_climatico.precipitacion_total IS 'Precipitación total acumulada en la semana epidemiológica (mm).';
COMMENT ON COLUMN dato_climatico.humedad_promedio    IS 'Promedio semanal de la humedad relativa (%).';

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PASO 3 — Índices de rendimiento                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Índice principal para consultas de correlación epidemiológica-climática
CREATE INDEX IF NOT EXISTS idx_clima_departamento_periodo
    ON dato_climatico (id_departamento, id_periodo);

-- Índice para filtros por periodo (consultas de rango temporal)
CREATE INDEX IF NOT EXISTS idx_clima_periodo
    ON dato_climatico (id_periodo);
