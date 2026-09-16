-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN 007 — Regla DGE de Semana Epidemiológica, Ingesta Climática y
--                 Re-etiquetado del Histórico 2010–2024
-- Proyecto  : HealthRadar — Célula 5
-- Fecha     : 2026-09-16
-- Precondición: Migraciones 001–006 aplicadas.
-- Propósito :
--   1. Implementar en SQL puro la regla de Semana Epidemiológica DGE/MINSA
--      (convención CDC/OPS: semanas domingo–sábado, SE 01 = primera semana
--      del año con ≥ 4 días en enero, equivale a "la semana domingo–sábado
--      que contiene el 4 de enero").
--      NOTA CRÍTICA (corrección sobre la propuesta original): el atajo
--      "EXTRACT(WEEK FROM fecha + 1)" NO reproduce la regla DGE. Ese truco
--      solo desplaza semanas ISO (regla de 4 días medida en semanas
--      lunes–domingo) a fronteras domingo–sábado. Verificado en BD real:
--      para 2026 (01-Ene = jueves) el atajo da SE 28 para el 05-Jul,
--      cuando el boletín oficial dice SE 27. La regla correcta se ancla
--      en el miércoles de cada semana domingo–sábado (día 4 de 7).
--      Validado contra boletines oficiales:
--        2022: 01-Ene = SE 52-2021; 02-Ene = inicio SE 01-2022
--        2023: 01-Ene al 07-Ene = SE 01-2023
--        2024: 31-Dic-2023 al 06-Ene-2024 = SE 01-2024
--        2026: 05-Jul al 11-Jul = SE 27-2026 (ancla reportada por Full-Stack)
--   2. Función fn_insertar_dato_climatico: n8n envía datos planos
--      (lat/lon + anio + semana epidemiológica del boletín DGE + valores)
--      y la BD resuelve el departamento, crea el periodo y hace upsert en
--      dato_climatico (3NF). Elimina la necesidad de la tabla plana
--      clima_alineado y de lógica JS de resolución en n8n.
--   NOTA DE CONTRATO (revisión con los workflows reales del Full-Stack,
--   Fase B — "Procesar 1 Boletin Pendiente"): el anio/semana se reciben
--   DIRECTAMENTE del boletín DGE (fuente de verdad epidemiológica), no se
--   derivan de una fecha. Esto elimina el desfase ISO↔DGE en el borde y
--   hace innecesario el "colchón de ±3 días" del nodo Open-Meteo:
--   n8n pedirá el rango EXACTO domingo–sábado y agregará sus 7 días,
--   sin re-clasificar fechas en JS.
--   3. Re-etiquetar el histórico 2010–2024 de dato_climatico (cargado con la
--      regla ISO basada en jueves, migración 004) hacia la regla DGE, para
--      que toda la serie temporal comparta la misma numeración.
--   4. Vista v_clima_actual desnormalizada con semana_inicio/semana_fin
--      (domingo–sábado DGE) para el webhook /consulta del agente.
-- ─────────────────────────────────────────────────────────────────────────────

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PASO 1 — Función base: regla DGE                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Regla DGE implementada con ancla en el MIÉRCOLES de cada semana
-- domingo–sábado (el miércoles es el día 4 de 7, garantiza la regla de
-- ≥4 días en enero):
--   1. El año epidemiológico de una fecha = año calendario del miércoles
--      de su semana domingo–sábado.
--   2. La SE 01 de un año es la semana domingo–sábado que contiene el 4
--      de enero (su miércoles cae entre el 01 y el 07 de enero).
-- DOW: domingo = 0. IMMUTABLE: segura para usar en índices y vistas.

CREATE OR REPLACE FUNCTION fn_semana_epi_dge(
    p_fecha DATE,
    OUT anio   INT,
    OUT semana INT
) AS $$
DECLARE
    v_domingo DATE;   -- domingo de la semana DGE que contiene p_fecha
    v_dom_se1 DATE;   -- domingo de la SE 01 del año epidemiológico
BEGIN
    v_domingo := p_fecha - EXTRACT(DOW FROM p_fecha)::INT;
    anio      := EXTRACT(YEAR FROM (v_domingo + 3))::INT;  -- año del miércoles
    v_dom_se1 := make_date(anio, 1, 4)
                 - EXTRACT(DOW FROM make_date(anio, 1, 4))::INT;
    semana    := ((v_domingo - v_dom_se1) / 7 + 1)::INT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION fn_semana_epi_dge(DATE) IS
    'Devuelve (anio, semana) según la regla epidemiológica DGE/MINSA '
    '(domingo–sábado, SE 01 = semana que contiene el 4 de enero). '
    'Validada: 2022-01-01 → (2021,52); 2026-07-05 → (2026,27).';

-- Función auxiliar inversa: fecha del DOMINGO (inicio) de una SE DGE dada.
CREATE OR REPLACE FUNCTION fn_dge_domingo(p_anio INT, p_semana INT)
RETURNS DATE AS $$
    SELECT (make_date(p_anio, 1, 4)
            - EXTRACT(DOW FROM make_date(p_anio, 1, 4))::INT
            + (p_semana - 1) * 7)::DATE;
$$ LANGUAGE sql IMMUTABLE;

COMMENT ON FUNCTION fn_dge_domingo(INT, INT) IS
    'Devuelve la fecha del domingo (día de inicio) de la semana epidemiológica '
    'DGE indicada. semana_inicio = fn_dge_domingo(a,s); semana_fin = +6 días.';

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PASO 2 — Función de ingesta plana → 3NF                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
CREATE OR REPLACE FUNCTION fn_insertar_dato_climatico(
    p_latitud  NUMERIC,
    p_longitud NUMERIC,
    p_anio     INT,
    p_semana   INT,
    p_temp_max         NUMERIC,
    p_temp_min         NUMERIC,
    p_precipitacion    NUMERIC,
    p_temp_mean        NUMERIC DEFAULT NULL,
    p_humedad          NUMERIC DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_id_dep     CHAR(2);
    v_id_periodo INT;
BEGIN
    IF p_semana NOT BETWEEN 1 AND 53 THEN
        RAISE EXCEPTION 'Semana epidemiológica inválida: %', p_semana;
    END IF;

    -- A. Resolver el departamento más cercano por distancia euclidiana
    --    (coordenadas de la migración 005, mismos centroides que usa n8n).
    --    Cubre el caso Callao: el clon de n8n envía las coordenadas de
    --    Callao (-12.05, -77.12), que resuelven a id '07' sin JS extra.
    SELECT id_departamento INTO v_id_dep
    FROM departamento
    WHERE latitud IS NOT NULL AND longitud IS NOT NULL
    ORDER BY ((latitud - p_latitud) ^ 2 + (longitud - p_longitud) ^ 2) ASC
    LIMIT 1;

    IF v_id_dep IS NULL THEN
        RAISE EXCEPTION 'No se pudo resolver el departamento para las coordenadas (%, %)',
            p_latitud, p_longitud;
    END IF;

    -- B. El periodo (anio, semana) llega DIRECTO del boletín DGE desde n8n
    --    (fuente de verdad epidеmiológica). Solo se asegura su existencia.
    INSERT INTO periodo_epidemiologico (anio, semana)
    VALUES (p_anio::SMALLINT, p_semana::SMALLINT)
    ON CONFLICT (anio, semana) DO NOTHING;

    SELECT id_periodo INTO v_id_periodo
    FROM periodo_epidemiologico
    WHERE anio = p_anio AND semana = p_semana;

    -- C. Completar media si no fue provista
    IF p_temp_mean IS NULL AND p_temp_max IS NOT NULL AND p_temp_min IS NOT NULL THEN
        p_temp_mean := ROUND((p_temp_max + p_temp_min) / 2.0, 2);
    END IF;

    -- D. Upsert en dato_climatico (idempotente, reemplaza al chequeo
    --    "ya existe este anio-semana?" del workflow Fase B)
    INSERT INTO dato_climatico (
        id_departamento, id_periodo,
        temp_max_promedio, temp_min_promedio, temp_mean_promedio,
        precipitacion_total, humedad_promedio
    ) VALUES (
        v_id_dep, v_id_periodo,
        p_temp_max, p_temp_min, p_temp_mean,
        p_precipitacion, p_humedad
    )
    ON CONFLICT (id_departamento, id_periodo) DO UPDATE SET
        temp_max_promedio   = EXCLUDED.temp_max_promedio,
        temp_min_promedio   = EXCLUDED.temp_min_promedio,
        temp_mean_promedio  = EXCLUDED.temp_mean_promedio,
        precipitacion_total = EXCLUDED.precipitacion_total,
        humedad_promedio    = COALESCE(EXCLUDED.humedad_promedio, dato_climatico.humedad_promedio);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_insertar_dato_climatico(NUMERIC, NUMERIC, INT, INT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC) IS
    'Ingesta de clima semanal desde n8n (Fase B): recibe coordenadas + (anio, semana) '
    'DGE tomados del boletín, resuelve el departamento más cercano, crea el periodo '
    'si no existe y hace upsert en dato_climatico. Idempotente: re-corridas actualizan.';

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PASO 3 — Re-etiquetado histórico 2010–2024 (ISO → DGE)                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- El histórico se cargó (migración 004) numerando semanas con la regla ISO
-- lunes–domingo / día ancla jueves. Se re-mapea cada id_periodo al periodo
-- DGE equivalente. Fecha representativa: el LUNES de la semana ISO —
-- los días lunes..sábado (6 de 7) de esa semana caen en la misma semana
-- DGE; solo el domingo de borde cae en la SE siguiente, sesgo mínimo
-- inherente a agregados ya calculados.
-- Solo en semanas de borde de año puede cambiar (anio, semana).
--
-- Estrategia segura ante el UNIQUE (anio, semana) y UNIQUE (id_departamento,
-- id_periodo):
--   1. Insertar los periodos DGE destino que falten (ON CONFLICT DO NOTHING).
--   2. Si ya existe fila del mismo departamento en el periodo destino,
--      eliminar la fila fuente (duplicado semántico — mismos datos agregados).
--   3. Si no existe, actualizar id_periodo de la fila fuente.

DO $$
DECLARE
    r RECORD;
    v_epi     RECORD;
    v_lunes   DATE;
    v_destino INT;
BEGIN
    FOR r IN
        SELECT p.id_periodo, p.anio, p.semana
        FROM periodo_epidemiologico p
        WHERE p.anio BETWEEN 2010 AND 2024
        ORDER BY p.anio, p.semana
    LOOP
        v_lunes := to_date(r.anio || lpad(r.semana::TEXT, 2, '0'), 'IYYYIW');

        CONTINUE WHEN v_lunes IS NULL;          -- semana inválida, no debería ocurrir
        -- El lunes ISO cae en la misma semana DGE que 6 de los 7 días del grupo
        SELECT * INTO v_epi FROM fn_semana_epi_dge(v_lunes);

        -- Nada que hacer si la regla DGE coincide con la ISO (caso mayoritario)
        CONTINUE WHEN v_epi.anio = r.anio AND v_epi.semana = r.semana;

        -- Garantizar que el periodo destino exista
        INSERT INTO periodo_epidemiologico (anio, semana)
        VALUES (v_epi.anio::SMALLINT, v_epi.semana::SMALLINT)
        ON CONFLICT (anio, semana) DO NOTHING;

        SELECT id_periodo INTO v_destino
        FROM periodo_epidemiologico
        WHERE anio = v_epi.anio AND semana = v_epi.semana;

        -- Colisión: ya existe fila del mismo departamento en el destino →
        -- eliminar la fuente (mismas métricas de la misma semana real).
        DELETE FROM dato_climatico dc
        WHERE dc.id_periodo = r.id_periodo
          AND EXISTS (
              SELECT 1 FROM dato_climatico tgt
              WHERE tgt.id_departamento = dc.id_departamento
                AND tgt.id_periodo      = v_destino
          );

        -- Re-etiquetar el resto
        UPDATE dato_climatico
        SET id_periodo = v_destino
        WHERE id_periodo = r.id_periodo;
    END LOOP;
END $$;

-- Limpieza: eliminar periodos históricos que quedaron huérfanos tras el
-- re-etiquetado (no referenciados por ninguna tabla hija).
DELETE FROM periodo_epidemiologico p
WHERE p.anio BETWEEN 2010 AND 2024
  AND NOT EXISTS (SELECT 1 FROM dato_climatico dc WHERE dc.id_periodo = p.id_periodo)
  AND NOT EXISTS (SELECT 1 FROM caso_dengue c           WHERE c.id_periodo = p.id_periodo)
  AND NOT EXISTS (SELECT 1 FROM caso_eda c               WHERE c.id_periodo = p.id_periodo)
  AND NOT EXISTS (SELECT 1 FROM caso_ira_neumonia c      WHERE c.id_periodo = p.id_periodo)
  AND NOT EXISTS (SELECT 1 FROM caso_ira_no_neumonia c   WHERE c.id_periodo = p.id_periodo);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PASO 4 — Vista desnormalizada para el agente / webhook /consulta       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- semana_inicio/semana_fin reconstruyen el rango domingo–sábado DGE exacto
-- vía fn_dge_domingo (la misma función inversa de la regla, no ISO).
-- Mantiene el contrato que hoy usa el nodo del agente en Conexion.json
-- (semana_inicio, semana_fin, métricas).

CREATE OR REPLACE VIEW v_clima_actual AS
SELECT
    d.id_departamento,
    d.nombre AS departamento,
    pe.anio,
    pe.semana,
    pe.semana AS semana_epidemiologica,               -- compatibilidad 1:1 con nodos JS de n8n
    fn_dge_domingo(pe.anio, pe.semana)     AS semana_inicio,  -- domingo
    fn_dge_domingo(pe.anio, pe.semana) + 6 AS semana_fin,     -- sábado
    dc.temp_max_promedio,
    dc.temp_min_promedio,
    dc.temp_mean_promedio,
    dc.precipitacion_total,
    dc.humedad_promedio
FROM dato_climatico dc
JOIN departamento d           ON dc.id_departamento = d.id_departamento
JOIN periodo_epidemiologico pe ON dc.id_periodo     = pe.id_periodo
ORDER BY pe.anio DESC, pe.semana DESC;

COMMENT ON VIEW v_clima_actual IS
    'Vista desnormalizada de dato_climatico con nombre de departamento, año/semana DGE '
    'y rango de fechas (domingo–sábado). Uso: webhook /consulta del agente de IA y reportes.';

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  VERIFICACIÓN MANUAL POST-MIGRACIÓN (no se ejecuta)                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Debe devolver las anclas DGE exactas:
--   SELECT * FROM fn_semana_epi_dge(DATE '2026-07-05');  -- (2026, 27)
--   SELECT * FROM fn_semana_epi_dge(DATE '2026-07-11');  -- (2026, 27)
--   SELECT * FROM fn_semana_epi_dge(DATE '2022-01-01');  -- (2021, 52)
--   SELECT * FROM fn_semana_epi_dge(DATE '2022-01-02');  -- (2022, 1)
--   SELECT * FROM fn_semana_epi_dge(DATE '2024-01-01');  -- (2024, 1)
--   SELECT * FROM fn_semana_epi_dge(DATE '2023-12-31');  -- (2024, 1) ¡SE01 inicia 31-Dic-2023!
--   SELECT * FROM fn_semana_epi_dge(DATE '2024-01-06');  -- (2024, 1) fin SE01
--   SELECT * FROM fn_dge_domingo(2026, 27);              -- 2026-07-05
--
-- Y la semana 27-2026 debe abarcar domingo 05-Jul a sábado 11-Jul:
--   SELECT semana_inicio, semana_fin FROM v_clima_actual
--   WHERE anio = 2026 AND semana = 27;
-- Semanas históricas re-etiquetadas (esperado: muy pocas, solo bordes de año):
--   SELECT anio, semana FROM periodo_epidemiologico WHERE anio BETWEEN 2010 AND 2024
--   ORDER BY anio, semana;
