-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN 006 — Cola de Boletines Epidemiológicos Descubiertos (DGE)
-- Proyecto  : HealthRadar — Célula 5
-- Fecha     : 2026-09-15
-- Autor     : Arquitecto (ajustada por Backend & IA Engineer)
-- Precondición: Migraciones 001–005 aplicadas.
-- Propósito : Tabla de cola para el pipeline de ingesta de PDFs del MINSA/DGE.
--             n8n descubre nuevos boletines en epipublic.dge.gob.pe, los registra
--             aquí con procesado=FALSE, y luego Gemini Flash extrae el resumen
--             actualizando procesado=TRUE (ADR-001, ADR-003).
--
-- Decisión de diseño (aprobada por Arquitecto + Full-Stack):
--   PK = id_boletin BIGSERIAL (surrogate) en vez de url_boletin TEXT.
--   Motivo: el DGE es inconsistente en el nombre de archivo del PDF; el mismo
--   boletín puede tener URLs distintas entre corridas. La clave natural real
--   es (anio, semana_epidemiologica) — hay exactamente 1 boletín por semana.
-- ─────────────────────────────────────────────────────────────────────────────

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  TABLA — boletin_descubierto                                            ║
-- ║  Granularidad: 1 fila = 1 PDF de boletín epidemiológico del DGE         ║
-- ║  Clave natural: (anio, semana_epidemiologica) — 1 boletín por semana.   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS boletin_descubierto (
    id_boletin            BIGSERIAL    PRIMARY KEY,
    anio                  INT          NOT NULL CHECK (anio >= 2010),
    semana_epidemiologica INT          NOT NULL CHECK (semana_epidemiologica BETWEEN 1 AND 53),
    url_boletin           TEXT         NOT NULL,
    procesado             BOOLEAN      NOT NULL DEFAULT FALSE,
    resumen               TEXT         NOT NULL DEFAULT '',  -- '' = pendiente (convención del flujo n8n)
    fecha_publicacion     DATE,                              -- 'fecha publicacion' del portal DGE
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT uq_boletin_anio_semana UNIQUE (anio, semana_epidemiologica)
);

COMMENT ON TABLE boletin_descubierto IS
    'Cola de boletines epidemiológicos descubiertos en el portal DGE (epipublic.dge.gob.pe). '
    'El pipeline de n8n inserta filas con procesado=FALSE al detectar nuevas URLs y '
    'actualiza procesado=TRUE tras extraer el resumen con Gemini Flash (ADR-003).';

COMMENT ON COLUMN boletin_descubierto.id_boletin            IS 'PK surrogate auto-incremental.';
COMMENT ON COLUMN boletin_descubierto.anio                  IS 'Año epidemiológico del boletín (≥ 2010, alineado con migración 003).';
COMMENT ON COLUMN boletin_descubierto.semana_epidemiologica IS 'Semana epidemiológica a la que corresponde el boletín (1–53).';
COMMENT ON COLUMN boletin_descubierto.url_boletin           IS 'URL directa al PDF del boletín en el portal DGE. Informativa, no es PK.';
COMMENT ON COLUMN boletin_descubierto.procesado             IS 'FALSE = pendiente de procesamiento LLM. TRUE = resumen generado.';
COMMENT ON COLUMN boletin_descubierto.resumen               IS 'Resumen estructurado extraído por Gemini Flash. Cadena vacía = pendiente de procesar.';
COMMENT ON COLUMN boletin_descubierto.fecha_publicacion     IS 'Fecha de publicación del boletín según el portal DGE (texto "fecha publicacion: DD-MM-AAAA" del listado). NULL si no se pudo extraer.';
COMMENT ON COLUMN boletin_descubierto.created_at            IS 'Timestamp de inserción del registro en la cola.';

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ÍNDICES DE RENDIMIENTO                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Índice parcial del pipeline: n8n filtra por procesado=FALSE para obtener la cola pendiente.
-- Solo indexa los no procesados (la mayoría serán TRUE en estado estable).
CREATE INDEX IF NOT EXISTS idx_boletin_procesado
    ON boletin_descubierto (procesado)
    WHERE procesado = FALSE;

-- Índice para consultas NLQ por año y semana (ej: "boletines de la semana 30 de 2025")
CREATE INDEX IF NOT EXISTS idx_boletin_anio_semana
    ON boletin_descubierto (anio, semana_epidemiologica);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  NOTAS DE USO — Referencia para los nodos PostgreSQL de n8n             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- INSERT (Fase A — descubrimiento, con fecha_publicacion del portal DGE):
--   INSERT INTO boletin_descubierto (anio, semana_epidemiologica, url_boletin, fecha_publicacion)
--   VALUES (2026, 37, 'https://epipublic.dge.gob.pe/...', '2026-09-10')
--   ON CONFLICT (anio, semana_epidemiologica) DO NOTHING;
--
-- SELECT (Fase B — el más antiguo pendiente, 1 por corrida):
--   SELECT * FROM boletin_descubierto
--   WHERE procesado = FALSE AND btrim(resumen) = ''
--   ORDER BY anio, semana_epidemiologica
--   LIMIT 1;
--
-- UPDATE (Fase B — tras procesamiento LLM):
--   UPDATE boletin_descubierto
--   SET procesado = TRUE, resumen = '...'
--   WHERE id_boletin = $1;
--
-- SELECT (Conexión /consulta — solo boletines con resumen real):
--   SELECT anio, semana_epidemiologica, resumen, fecha_publicacion
--   FROM boletin_descubierto
--   WHERE procesado = TRUE AND btrim(resumen) <> ''
--   ORDER BY anio, semana_epidemiologica;
