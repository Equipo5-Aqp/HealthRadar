-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN 009 — Embeddings de boletines (HU-3) y memoria del chat (historial por sesión)
-- Proyecto  : HealthRadar — Célula 5
-- Fecha     : 2026-10-05
-- Autor     : Backend & IA Engineer
-- Precondición: Migraciones 001–007 aplicadas (la 008, login, es independiente:
--               no hay dependencia entre ambas, pueden aplicarse en cualquier orden).
-- Propósito : 1) Guardar, junto al resumen de cada boletín, su vector de embedding
--                para recuperar los boletines semánticamente parecidos a la pregunta
--                del usuario (retrieval del RAG híbrido, plan v2.3).
--             2) Tabla chat_mensaje: historial corto por sesión para el chat. Reemplaza
--                a "Simple Memory" (RAM) cuando los modelos se llaman por HTTP en vez
--                de por AI Agent. Las dos partes son independientes entre sí.
--
-- DECISIONES (propuestas por Full-Stack; PENDIENTES de confirmación del Arquitecto):
--   (a) Dimensión 768. Es la que el plan v2.3 indica para Gemini, usando
--       gemini-embedding-001 o gemini-embedding-2 con outputDimensionality = 768
--       (text-embedding-004, citado en el plan, fue apagado el 14-ene-2026).
--       Si el Arquitecto elige NVIDIA NIM (1024), cambiar SOLO el número en
--       "vector(768)" ANTES de aplicar. Si ya se aplicó y la columna sigue vacía,
--       ver la nota de reversión al final.
--   (b) Opción A del plan: columna en boletin_descubierto (cero duplicación; el
--       UPDATE de Fase B que guarda el resumen guarda también el embedding).
--
-- NO SE TOCA reportes_embeddings (migración 001): es la PoC del ADR-002 (1536
-- dimensiones, datos sintéticos). Un "CREATE TABLE IF NOT EXISTS reportes_embeddings"
-- con otro esquema NO funcionaría: la tabla ya existe y n8n se saltaría la creación
-- sin avisar. Por eso se eligió la Opción A y no la B.
--
-- Migración aditiva e idempotente: no borra datos existentes; en boletin_descubierto solo
-- agrega columnas nulas (las filas actuales quedan con embedding NULL hasta el backfill).
-- Único UPDATE: rellena request_id en filas de chat_mensaje de un borrador anterior (si existen).
-- ─────────────────────────────────────────────────────────────────────────────

-- Idempotente: ya la crea la 001, se repite por si esta migración se aplica sola.
CREATE EXTENSION IF NOT EXISTS vector;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  COLUMNAS — boletin_descubierto                                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
ALTER TABLE boletin_descubierto
    ADD COLUMN IF NOT EXISTS embedding           vector(768),
    ADD COLUMN IF NOT EXISTS modelo_embedding    TEXT,
    ADD COLUMN IF NOT EXISTS embedding_creado_en TIMESTAMPTZ;

COMMENT ON COLUMN boletin_descubierto.embedding           IS 'Vector (768 dims) del campo resumen. NULL = aún sin indexar. Se usa el MISMO modelo para indexar y para consultar.';
COMMENT ON COLUMN boletin_descubierto.modelo_embedding    IS 'Modelo que generó el vector (p. ej. gemini-embedding-001). Si cambia el modelo hay que reindexar todo.';
COMMENT ON COLUMN boletin_descubierto.embedding_creado_en IS 'Momento en que se generó el embedding.';

-- Red de seguridad: vector y modelo van siempre juntos. Evita un vector sin saber
-- con qué modelo se generó (no se podría decidir si hay que reindexar).
-- (ADD CONSTRAINT no admite IF NOT EXISTS: se consulta el catálogo.)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname  = 'chk_boletin_embedding_modelo'
          AND conrelid = 'boletin_descubierto'::regclass
    ) THEN
        ALTER TABLE boletin_descubierto
            ADD CONSTRAINT chk_boletin_embedding_modelo
            CHECK ((embedding IS NULL) = (modelo_embedding IS NULL));
    END IF;
END $$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ÍNDICE — búsqueda por similitud coseno                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- HNSW con los parámetros por defecto de pgvector escritos de forma explícita
-- (m = 16, ef_construction = 64) para que el afinamiento posterior (HU-302,
-- Arquitecto) parta de un valor visible. Con decenas/cientos de filas un escaneo
-- exacto también sería suficiente; el índice se deja por lo indicado en el plan v2.3.
-- Las filas con embedding NULL no entran al índice.
-- No hace falta un B-Tree adicional: idx_boletin_anio_semana (006) ya cubre
-- los filtros por (anio, semana_epidemiologica).
CREATE INDEX IF NOT EXISTS idx_boletin_embedding_hnsw
    ON boletin_descubierto
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  PARTE 2 — MEMORIA DEL CHAT: chat_mensaje                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Guarda SOLO la pregunta del usuario y la respuesta del asistente (no el contexto de
-- boletines/clima, que se recalcula en cada pregunta y haría crecer el historial).
-- session_id lo envía el front (máx. 64 caracteres). Sin session_id no se guarda
-- nada y el chat responde como una pregunta suelta.
-- SEGURIDAD: el historial se lee solo por session_id, sin autenticación por sesión. El front
-- debe generar el session_id como UUID criptográfico (crypto.randomUUID()), NUNCA secuencial
-- ni derivado de datos del usuario: quien adivine un session_id puede leer ese historial.
-- Sin datos personales por diseño: son preguntas de salud pública sobre boletines,
-- pero el texto es libre, por eso hay purga (ver NOTAS DE USO).
CREATE TABLE IF NOT EXISTS chat_mensaje (
    id_mensaje  BIGSERIAL    PRIMARY KEY,
    session_id  TEXT         NOT NULL CHECK (char_length(session_id) BETWEEN 1 AND 64),
    request_id  TEXT         NOT NULL,
    rol         TEXT         NOT NULL CHECK (rol IN ('user', 'assistant')),
    contenido   TEXT         NOT NULL CHECK (char_length(contenido) BETWEEN 1 AND 4000),
    creado_en   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Si la tabla ya existía de un borrador anterior de esta migración (sin request_id),
-- se completa aquí. Idempotente: en una base nueva estas tres sentencias no hacen nada.
ALTER TABLE chat_mensaje ADD COLUMN IF NOT EXISTS request_id TEXT;
UPDATE chat_mensaje SET request_id = 'legacy-' || id_mensaje WHERE request_id IS NULL;
ALTER TABLE chat_mensaje ALTER COLUMN request_id SET NOT NULL;

-- Largo de request_id (ADD CONSTRAINT no admite IF NOT EXISTS: se consulta el catálogo).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname  = 'chk_chat_mensaje_request_id'
          AND conrelid = 'chat_mensaje'::regclass
    ) THEN
        ALTER TABLE chat_mensaje
            ADD CONSTRAINT chk_chat_mensaje_request_id
            CHECK (char_length(request_id) BETWEEN 1 AND 64);
    END IF;
END $$;

COMMENT ON TABLE  chat_mensaje            IS 'Historial corto del chat por sesión (pregunta y respuesta). Se purga por antigüedad.';
COMMENT ON COLUMN chat_mensaje.session_id IS 'Identificador de la conversación que envía el front (máx. 64). Debe ser un UUID criptográfico no adivinable: es la única llave de lectura del historial.';
COMMENT ON COLUMN chat_mensaje.request_id IS 'Identificador de UNA vuelta (pregunta + respuesta), generado por el flujo. Con UNIQUE (request_id, rol) un reintento del nodo no duplica la vuelta.';
COMMENT ON COLUMN chat_mensaje.rol        IS 'user = pregunta del usuario; assistant = respuesta del modelo.';
COMMENT ON COLUMN chat_mensaje.contenido  IS 'Texto del mensaje, recortado a 4000 caracteres (LEFT en el INSERT).';

-- Idempotencia del guardado: una vuelta = 2 filas (user, assistant) con el mismo
-- request_id; por eso la clave única es (request_id, rol) y no solo request_id.
CREATE UNIQUE INDEX IF NOT EXISTS ux_chat_mensaje_request_rol
    ON chat_mensaje (request_id, rol);

-- Lectura de los últimos N mensajes de una sesión.
CREATE INDEX IF NOT EXISTS idx_chat_mensaje_sesion
    ON chat_mensaje (session_id, id_mensaje DESC);
-- Purga por antigüedad.
CREATE INDEX IF NOT EXISTS idx_chat_mensaje_creado
    ON chat_mensaje (creado_en);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  NOTAS DE USO — Referencia para los nodos PostgreSQL de n8n             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Los vectores viajan como texto '[0.12,-0.03,...]' y se castean con ::vector.
--
-- UPDATE (Fase B — guarda resumen y embedding en la MISMA sentencia):
--   UPDATE boletin_descubierto
--   SET procesado = TRUE,
--       resumen = $2,
--       embedding = $3::vector,
--       modelo_embedding = $4,
--       embedding_creado_en = now()
--   WHERE id_boletin = $1;
--   Si la llamada de embeddings falla, guardar el resumen SIN embedding (NULL, NULL,
--   NULL): el backfill lo completa después y el resumen no se pierde.
--   VALIDAR LA DIMENSIÓN ANTES DEL UPDATE (nodo Code previo al Postgres). Un vector con
--   otra dimensión (modelo equivocado, outputDimensionality mal puesto, cambio a NIM-1024)
--   hace fallar el cast ::vector y el rollback se lleva TAMBIÉN el resumen y procesado = TRUE.
--   Validación inline en el nodo Code de n8n (sin tocar el core). embedding y modelo van
--   SIEMPRE en pareja (el CHECK chk_boletin_embedding_modelo lo exige):
--     const vec = $input.first().json.embedding;
--     const ok = Array.isArray(vec) && vec.length === 768 && vec.every(Number.isFinite);
--     return [{ json: {
--       embedding: ok ? JSON.stringify(vec) : null,                  // $3
--       modelo_embedding: ok ? 'gemini-embedding-001' : null,        // $4
--     } }];
--   Con vector malo el UPDATE guarda resumen + NULL/NULL y el backfill reintenta después.
--   Si un boletín se REPROCESA (nuevo resumen), poner embedding = NULL,
--   modelo_embedding = NULL y embedding_creado_en = NULL en el mismo UPDATE (el
--   vector viejo ya no corresponde; sin limpiar la fecha quedaría una marca
--   de "indexado" falsa).
--
-- BACKFILL (job único en n8n; idempotente, procesa lo que falte):
--   SELECT id_boletin, resumen
--   FROM boletin_descubierto
--   WHERE procesado = TRUE AND btrim(resumen) <> '' AND embedding IS NULL
--   ORDER BY anio, semana_epidemiologica
--   LIMIT 20;
--   (Solo existen resúmenes desde 2025: para 2010–2024 no hay texto que indexar.)
--
-- BACKFILL — UPDATE por fila (las TRES columnas juntas; con solo embedding el CHECK
-- chk_boletin_embedding_modelo rechaza la sentencia). Validar el vector igual que arriba:
--   UPDATE boletin_descubierto
--   SET embedding = $2::vector,
--       modelo_embedding = $3,
--       embedding_creado_en = now()
--   WHERE id_boletin = $1
--     AND embedding IS NULL;               -- no pisa uno que otro proceso ya completó
--   Si el vector no pasa la validación, NO ejecutar el UPDATE (la fila sigue pendiente).
--   Límites de tasa: ~100 boletines = ~100 llamadas. El free tier de Gemini corta las
--   ráfagas: en el bucle de n8n poner una pausa entre iteraciones (p. ej. nodo Wait de 1–2 s)
--   y reintento con espera creciente ante HTTP 429. El LIMIT 20 de arriba acota cada corrida.
--
-- RETRIEVAL (Conexión /consulta). Umbral 0.35 = similitud mínima 0.65; k = 3–5.
-- Se recomienda calibrar ambos valores con las trazas de Phoenix.
--   SELECT anio, semana_epidemiologica, resumen,
--          embedding <=> $1::vector AS distancia
--   FROM boletin_descubierto
--   WHERE procesado = TRUE
--     AND embedding IS NOT NULL
--     AND modelo_embedding = $2              -- no mezclar vectores de modelos distintos
--     AND (embedding <=> $1::vector) < 0.35
--   ORDER BY embedding <=> $1::vector
--   LIMIT $3::int;                         -- k parametrizado (3–5; por defecto 5)
--   Así k se calibra con las trazas de Phoenix sin editar el SQL del workflow: el nodo pasa
--   $3 = 5 y el valor se cambia en un solo lugar (nodo Set o variable de entorno).
--
-- ── MEMORIA DEL CHAT (chat_mensaje) ──────────────────────────────────────────
-- LEER (antes de armar el prompt; devuelve en orden cronológico):
--   SELECT rol, contenido
--   FROM (
--     SELECT id_mensaje, rol, contenido
--     FROM chat_mensaje
--     WHERE session_id = $1
--     ORDER BY id_mensaje DESC
--     LIMIT 6                              -- 3 vueltas (pregunta + respuesta)
--   ) t
--   ORDER BY id_mensaje ASC;
--
-- GUARDAR (después de responder). $2 = request_id (UUID generado en el flujo, el MISMO
-- en un reintento del nodo); $3/$4 = pregunta/respuesta; $5 = guardar (boolean).
--   INSERT INTO chat_mensaje (session_id, request_id, rol, contenido)
--   SELECT v.sid, v.rid, v.rol, v.txt
--   FROM (VALUES ($1::text, $2::text, 'user',      LEFT($3::text, 4000)),
--                ($1::text, $2::text, 'assistant', LEFT($4::text, 4000))) AS v(sid, rid, rol, txt)
--   WHERE $5::boolean
--     AND btrim($3::text) <> '' AND btrim($4::text) <> ''
--   ON CONFLICT (request_id, rol) DO NOTHING;
--   - LEFT(..., 4000): el recorte también ocurre en SQL, no solo en el flujo.
--   - Respuesta vacía: no se escribe NADA (ni siquiera la pregunta). Una pregunta sin
--     respuesta en el historial deja al modelo siguiente con un turno "user" huérfano;
--     y un CHECK fallido en una fila haría fallar toda la sentencia.
--   - ON CONFLICT: si el nodo se reintenta tras un timeout con el INSERT ya confirmado,
--     la segunda ejecución no duplica la vuelta.
--
-- PURGA (flujo programado, p. ej. cada hora; conserva 24 h):
--   DELETE FROM chat_mensaje WHERE creado_en < now() - interval '24 hours';
--   Relacionado con HU-304 (anti-OOM): evita que la tabla crezca sin límite.
--
-- VERIFICACIÓN (solo lectura):
--   SELECT count(*) FILTER (WHERE embedding IS NOT NULL) AS con_embedding,
--          count(*) FILTER (WHERE procesado AND btrim(resumen) <> '' AND embedding IS NULL) AS por_indexar
--   FROM boletin_descubierto;
--
-- REVERSIÓN (manual, destructiva; NO forma parte de la migración). Solo si hay que
-- cambiar la dimensión y la columna aún no tiene datos útiles; luego se vuelve a
-- aplicar este archivo con la dimensión nueva:
--   DROP INDEX IF EXISTS idx_boletin_embedding_hnsw;
--   ALTER TABLE boletin_descubierto DROP CONSTRAINT IF EXISTS chk_boletin_embedding_modelo;
--   ALTER TABLE boletin_descubierto
--       DROP COLUMN IF EXISTS embedding,
--       DROP COLUMN IF EXISTS modelo_embedding,
--       DROP COLUMN IF EXISTS embedding_creado_en;
--   DROP INDEX IF EXISTS ux_chat_mensaje_request_rol;
--   DROP INDEX IF EXISTS idx_chat_mensaje_sesion;
--   DROP INDEX IF EXISTS idx_chat_mensaje_creado;
--   DROP TABLE IF EXISTS chat_mensaje;
