-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN 011 — Caché de preguntas frecuentes del chat (Sprint 4 · HU3)
-- Proyecto  : HealthRadar — Célula 5
-- Fecha     : 2026-11-02
-- Autor     : Backend & IA Engineer
-- Precondición: Migraciones 001–010 aplicadas.
-- Propósito : Guardar la respuesta del chat a una pregunta ya respondida, para devolverla en
--             milisegundos mientras los datos no cambien (sin volver a llamar al modelo).
--
-- CÓMO FUNCIONA (las decisiones las toma @healthradar/core, builders/cache-consulta.js)
--   · clave         = SHA-256 de (versión de la caché + huella del prompt + pregunta normalizada).
--                     Si cambia el prompt del sistema, las entradas viejas dejan de coincidir solas.
--   · version_datos = huella de los datos con los que se respondió (boletines procesados + clima),
--                     calculada por fn_cache_version_datos() (definida abajo: UNA sola definición
--                     versionada, el flujo solo la llama). Un boletín nuevo o reprocesado → otra huella
--                     → la entrada ya no se sirve, aunque no haya vencido.
--   · expira_en     = creado_en + 24 h.
--   · Solo se guarda la PRIMERA pregunta de una sesión y solo respuestas sanas (ver el core).
--
-- GARANTÍAS DE DISEÑO
--   1. ADITIVA e IDEMPOTENTE: solo CREATE ... IF NOT EXISTS / CREATE OR REPLACE. No toca otras tablas.
--   2. Sin datos personales: se guarda la pregunta NORMALIZADA (sin tildes ni signos), nunca el
--      session_id. Aun así es texto libre → se purga solo (ver «PURGA») y su tamaño está acotado:
--        · por fila: CHECK de tamaño de `respuesta` (esta migración);
--        · por tabla: tope de 2000 entradas (MAX_ENTRADAS en @healthradar/core, builders/cache-consulta.js).
--          LO APLICA EL FLUJO al guardar (nodo «Guardar en cache»: no inserta si la tabla llegó al tope,
--          salvo que renueve una clave que ya existe). La tabla en sí no impone ese tope.
--   3. Si la tabla falta o falla, el chat sigue funcionando sin caché (el flujo continúa ante error).
--
-- PURGA
--   · Al guardar, el flujo borra las entradas vencidas hace más de 1 día (no hace falta un cron).
--   · Vaciar todo a mano (p. ej. al cambiar de modelo):   DELETE FROM cache_consulta;
--   · Ver las preguntas más repetidas:                    SELECT * FROM v_cache_frecuentes;
-- ─────────────────────────────────────────────────────────────────────────────

-- Huella (md5) de lo que el chat usa para responder: resúmenes de boletines procesados + clima.
-- Cambia si llega un boletín, si se reprocesa uno (cambia su texto) o si entra clima nuevo.
-- STABLE: lee tablas pero no las modifica. Misma regla de «boletín procesado» que usa el chat.
CREATE OR REPLACE FUNCTION fn_cache_version_datos()
RETURNS TEXT AS $$
    SELECT md5(
        COALESCE((SELECT string_agg(anio || '-' || semana_epidemiologica || ':' || md5(resumen), ','
                                    ORDER BY anio, semana_epidemiologica)
                    FROM boletin_descubierto
                   WHERE procesado = TRUE AND btrim(resumen) <> ''), '')
        || '|' ||
        COALESCE((SELECT MAX(p.anio * 100 + p.semana) || '/' || COUNT(*)
                    FROM dato_climatico d
                    JOIN periodo_epidemiologico p ON p.id_periodo = d.id_periodo), '')
    );
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION fn_cache_version_datos() IS
    'Huella md5 de los boletines procesados (texto del resumen) y del clima. Si cambia, las entradas de cache_consulta dejan de servirse.';

CREATE TABLE IF NOT EXISTS cache_consulta (
    clave           TEXT         PRIMARY KEY CHECK (char_length(clave) = 64),
    pregunta        TEXT         NOT NULL CHECK (char_length(pregunta) BETWEEN 1 AND 500),
    version_datos   TEXT         NOT NULL CHECK (char_length(version_datos) BETWEEN 1 AND 64),
    respuesta       JSONB        NOT NULL CHECK (jsonb_typeof(respuesta) = 'object'),
    creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expira_en       TIMESTAMPTZ  NOT NULL,
    aciertos        INT          NOT NULL DEFAULT 0 CHECK (aciertos >= 0),
    ultimo_acierto  TIMESTAMPTZ,

    CONSTRAINT chk_cache_consulta_vigencia CHECK (expira_en > creado_en),
    -- El core ya no guarda respuestas de más de 12 000 caracteres; este tope (en bytes, con margen
    -- para tildes y escapes JSON) es la red de seguridad de la tabla.
    CONSTRAINT chk_cache_consulta_tamano   CHECK (octet_length(respuesta::text) <= 32000)
);

COMMENT ON TABLE  cache_consulta               IS 'Respuestas del chat guardadas por pregunta normalizada. Vigencia 24 h y mientras no cambien los datos (version_datos).';
COMMENT ON COLUMN cache_consulta.clave          IS 'SHA-256 hex de versión de caché + huella del prompt + pregunta normalizada (la arma el core).';
COMMENT ON COLUMN cache_consulta.pregunta       IS 'Pregunta normalizada (minúsculas, sin tildes ni signos). Solo informativa: la búsqueda va por clave.';
COMMENT ON COLUMN cache_consulta.version_datos  IS 'Huella de fn_cache_version_datos() al responder (boletines procesados + clima). Si difiere de la actual, la entrada no se sirve.';
COMMENT ON COLUMN cache_consulta.respuesta      IS 'Respuesta tal como la ve el front: output, nivel_riesgo, modelo_usado, proveedor, agente.';
COMMENT ON COLUMN cache_consulta.expira_en      IS 'Momento a partir del cual la entrada ya no se sirve.';
COMMENT ON COLUMN cache_consulta.aciertos       IS 'Veces que se sirvió desde la caché (mide qué preguntas son frecuentes). Se conserva al renovar la entrada.';
COMMENT ON COLUMN cache_consulta.ultimo_acierto IS 'Última vez que se sirvió desde la caché.';

-- Purga de vencidas.
CREATE INDEX IF NOT EXISTS idx_cache_consulta_expira
    ON cache_consulta (expira_en);

-- Preguntas más repetidas (vigentes o no), para ver qué conviene precalentar o revisar.
CREATE OR REPLACE VIEW v_cache_frecuentes AS
SELECT
    pregunta,
    aciertos,
    creado_en,
    expira_en,
    (expira_en > now())                       AS vigente,
    respuesta ->> 'modelo_usado'              AS modelo_usado,
    respuesta ->> 'nivel_riesgo'              AS nivel_riesgo
FROM cache_consulta
ORDER BY aciertos DESC, creado_en DESC;

COMMENT ON VIEW v_cache_frecuentes IS
    'Entradas de cache_consulta ordenadas por aciertos: las preguntas que más se repiten.';
