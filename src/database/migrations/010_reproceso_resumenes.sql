-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN 010 — Reproceso de resúmenes antiguos (uno por corrida, sin borrar nada)
-- Proyecto  : HealthRadar — Célula 5
-- Fecha     : 2026-10-11
-- Autor     : Backend & IA Engineer
-- Precondición: Migraciones 001–009 aplicadas.
-- Propósito : Los resúmenes generados con el prompt antiguo no traen la línea
--             `[CIFRAS: k=v; …]` que usan Panorama y la verificación de cifras.
--             Un flujo aparte los regenera DE UNO EN UNO con el prompt vigente
--             (opción A "Reprocesar 1 Resumen Antiguo" u opción B "Vaciar 1 Resumen
--             Antiguo"; ver el documento de propuesta). Esta migración solo añade lo
--             necesario para que ese proceso sea seguro, sea cual sea la opción:
--               · resumen_anterior      → copia del texto viejo (volver atrás por boletín).
--               · reproceso_intentos    → tope de intentos; un boletín que falla no
--                                          bloquea la cola (los fallidos pasan al final).
--               · reproceso_ultimo_error→ motivo del último fallo (diagnóstico).
--               · reproceso_en          → cuándo fue el último intento.
--               · fn_resumen_tiene_cifras() → UNA sola definición de "resumen nuevo"
--                                          (la usan el flujo y la vista de progreso).
--               · v_reproceso_progreso  → avance del reproceso en una fila.
--
-- GARANTÍAS DE DISEÑO
--   1. ADITIVA e IDEMPOTENTE: solo ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE.
--      NO modifica, vacía ni borra ningún resumen. NO cambia `procesado`.
--   2. El resumen viejo nunca se pierde: queda en `resumen_anterior`. Con la opción A
--      el boletín conserva además su `resumen` intacto mientras espera su turno; con la
--      opción B queda con `resumen` vacío hasta que Fase B lo regenera, y el flujo lo
--      restaura solo si Fase B no lo logra en el plazo definido.
--   3. Con la opción A, el reemplazo es un único UPDATE y solo si el resumen nuevo pasó
--      la validación completa de @healthradar/core (con `exigirCifras`).
--
-- VERIFICACIÓN MANUAL (no se ejecuta):
--   SELECT * FROM v_reproceso_progreso;
--   SELECT fn_resumen_tiene_cifras(E'texto\n[CIFRAS: dengue_total=10]');   -- t
--   SELECT fn_resumen_tiene_cifras('resumen viejo sin marcador');          -- f
--
-- VOLVER ATRÁS (por boletín o todos; el embedding se regenera solo en "Indexar"):
--   UPDATE boletin_descubierto
--      SET resumen = resumen_anterior, procesado = TRUE, resumen_anterior = NULL,
--          reproceso_intentos = 0, reproceso_ultimo_error = NULL,
--          embedding = NULL, modelo_embedding = NULL, embedding_creado_en = NULL
--    WHERE resumen_anterior IS NOT NULL;      -- añadir "AND id_boletin = N" para uno solo
--
-- REINTENTAR los boletines que agotaron sus intentos (después de arreglar la causa):
--   UPDATE boletin_descubierto SET reproceso_intentos = 0, reproceso_ultimo_error = NULL
--    WHERE reproceso_intentos >= 5 AND NOT fn_resumen_tiene_cifras(resumen);
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE boletin_descubierto
    ADD COLUMN IF NOT EXISTS resumen_anterior        TEXT,
    ADD COLUMN IF NOT EXISTS reproceso_intentos      INT         NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS reproceso_ultimo_error  TEXT,
    ADD COLUMN IF NOT EXISTS reproceso_en            TIMESTAMPTZ;

COMMENT ON COLUMN boletin_descubierto.resumen_anterior       IS 'Resumen previo al reproceso (se guarda una sola vez). Permite volver atrás por boletín. NULL = nunca reprocesado.';
COMMENT ON COLUMN boletin_descubierto.reproceso_intentos     IS 'Veces que el flujo de reproceso intentó este boletín. Tope 5 (definido en el flujo y en v_reproceso_progreso).';
COMMENT ON COLUMN boletin_descubierto.reproceso_ultimo_error IS 'Motivo del último intento fallido del reproceso (recortado). NULL si no hubo fallo o si el reproceso tuvo éxito.';
COMMENT ON COLUMN boletin_descubierto.reproceso_en           IS 'Momento del último intento del flujo de reproceso.';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname  = 'chk_boletin_reproceso_intentos'
          AND conrelid = 'boletin_descubierto'::regclass
    ) THEN
        ALTER TABLE boletin_descubierto
            ADD CONSTRAINT chk_boletin_reproceso_intentos CHECK (reproceso_intentos >= 0);
    END IF;
END $$;

-- ¿El resumen trae la línea `[CIFRAS: …]` en una línea propia?
-- Misma regla que @healthradar/core (parsers/cifras-boletin.js: ^[ \t]*\[CIFRAS:…\][ \t]*$ por líneas,
-- sin distinguir mayúsculas). IMMUTABLE: depende solo del texto.
CREATE OR REPLACE FUNCTION fn_resumen_tiene_cifras(p_resumen TEXT)
RETURNS BOOLEAN AS $$
    SELECT COALESCE(p_resumen ~* '(^|\n)[ \t]*\[CIFRAS:[^\]\n]*\][ \t\r]*(\n|$)', FALSE);
$$ LANGUAGE sql IMMUTABLE;

COMMENT ON FUNCTION fn_resumen_tiene_cifras(TEXT) IS
    'TRUE si el resumen contiene la línea [CIFRAS: …] (formato del prompt vigente). '
    'Un resumen con FALSE se considera "antiguo" y entra en la cola del reproceso.';

-- Avance del reproceso (una fila). El tope de 5 intentos debe coincidir con el del flujo.
CREATE OR REPLACE VIEW v_reproceso_progreso AS
SELECT
    count(*) FILTER (WHERE procesado AND btrim(resumen) <> '')                                                       AS con_resumen,
    count(*) FILTER (WHERE procesado AND btrim(resumen) <> '' AND fn_resumen_tiene_cifras(resumen))                  AS nuevos_con_cifras,
    count(*) FILTER (WHERE procesado AND btrim(resumen) <> '' AND NOT fn_resumen_tiene_cifras(resumen)
                       AND reproceso_intentos < 5)                                                                   AS pendientes,
    count(*) FILTER (WHERE procesado AND btrim(resumen) <> '' AND NOT fn_resumen_tiene_cifras(resumen)
                       AND reproceso_intentos >= 5)                                                                  AS agotados,
    count(*) FILTER (WHERE resumen_anterior IS NOT NULL)                                                             AS reprocesados_por_el_flujo,
    max(reproceso_en)                                                                                                AS ultimo_intento
FROM boletin_descubierto;

COMMENT ON VIEW v_reproceso_progreso IS
    'Avance del reproceso de resúmenes antiguos: pendientes (en cola), agotados (5 intentos fallidos), '
    'nuevos_con_cifras (ya con el formato vigente) y cuántos reemplazó el flujo.';
