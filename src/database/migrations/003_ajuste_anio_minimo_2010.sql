-- ==============================================================================
-- MIGRACIÓN 003 — Ajuste de año mínimo de datos epidemiológicos
-- Precondición: La migración 002 ya fue aplicada.
-- Motivo: Se decide usar únicamente datos desde 2010 en adelante para
--         alinear el modelo con el rango de datos limpiados por el ETL.
-- ==============================================================================

-- Eliminar el CHECK constraint actual en periodo_epidemiologico
ALTER TABLE periodo_epidemiologico
    DROP CONSTRAINT IF EXISTS periodo_epidemiologico_anio_check;

-- Agregar el nuevo CHECK constraint con año mínimo 2010
ALTER TABLE periodo_epidemiologico
    ADD CONSTRAINT periodo_epidemiologico_anio_check
    CHECK (anio BETWEEN 2010 AND 2100);
