-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN 008 — Autenticación (HU-6): usuarios, sesiones y bitácora de accesos
-- Proyecto  : HealthRadar — Célula 5
-- Fecha     : 2026-09-29 (revisión v3.3: 2026-10-05)
-- Autor     : Backend & IA Engineer (revisada y corregida por Arquitectura)
-- Precondición: Migraciones 001–007 aplicadas.
-- Propósito : Almacén de credenciales, sesiones y bitácora de intentos de login.
--             El flujo vive en n8n (evento) → @healthradar/core (política) →
--             funciones SQL de este archivo (criptografía y atomicidad).
--             El navegador nunca ve la URL del webhook (ADR-004).
--
-- HISTORIAL DE REVISIONES (todo verificado en PostgreSQL 16):
--   v2  Arquitectura: pgcrypto, sesiones con token opaco, funciones SQL.
--   v3  Full-Stack (aprobada por Arquitectura):
--       b) fn_usuario_autenticar evaluaba crypt() dentro del WHERE. El planificador
--          lo ordena ANTES de comparar el correo (plan genérico), así que bcrypt
--          corría sobre cada fila: con 31 usuarios un login correcto tardaba ~1.9 s
--          y el tiempo delataba qué correos existen. Ahora se busca la cuenta y se
--          hace exactamente UN crypt() en todas las rutas (~60 ms).
--       c) fn_usuario_registrar_fallo no era atómica (SELECT y luego UPDATE): 40
--          fallos en paralelo contaban 21, lo que permite saltarse el bloqueo.
--          Ahora es un único UPDATE.
--       d) Un fallo estando YA bloqueado extendía el bloqueo (denegación de
--          servicio contra la víctima). Ahora no se extiende.
--   v3.1 Full-Stack (observaciones R3–R7 de Arquitectura):
--       R3 fn_usuario_autenticar es VOLATILE (llama a gen_salt(), que lo es).
--       R4 login_evento.motivo solo admite los valores que el flujo produce
--          ('ok','credenciales','bloqueado','no_existe'); mapeo documentado abajo.
--       R5 intentos_fallidos no se incrementa mientras hay un bloqueo vigente
--          (una UI que muestre "3 de 5" ya no miente).
--       R6 cabecera sin la marca "(v2...)", typo de X-Forwarded-FROM corregido y
--          entrada (a) falsa retirada de este historial.
--       R7 la verificación manual usa created_at + 1 microsegundo y limpia la cuenta.
--   v3.2 Full-Stack (solo comentarios y notas de uso; el esquema y las funciones no cambian):
--       - Índice idx_login_evento_fecha: la purga se hace con fn_auth_purgar() (antes
--         decía fn_sesion_purgar(), que no existe).
--       - Ejemplo LOGIN FALLIDO: el motivo ya no va fijo en 'credenciales'; sigue el
--         mapeo ('no_existe' | 'bloqueado' | 'credenciales').
--       - Verificación: el paso 7 también borra login_evento de la cuenta de prueba
--         (sobreviven al borrado del usuario por ON DELETE SET NULL) y se añade el
--         paso 8 (aplicar esta migración dos veces: base en blanco y base ya migrada).
--       - R1: nota de uso sobre la contraseña en claro en n8n y corrección del
--         COMMENT de usuario.password_hash (decía que la contraseña nunca pasa por n8n).
--   v3.3 Full-Stack, 2026-10-05 (revisión de Arquitectura sobre v3.2; solo comentarios y notas):
--       - Archivo renombrado a 008_autenticacion_usuarios.sql (convención NNN_descripcion).
--       - Paso 8 ejecutable: deriva PG_USER/PG_DB del contenedor y usa docker cp + psql -f
--         (sin pipe ni -Raw, por la codificación de PowerShell 5.1).
--       - Nota R2: la idempotencia de este archivo NO protege al pipeline de CD (paso 2.5).
--       - R1: se recomienda la configuración por workflow (las variables EXECUTIONS_DATA_*
--         son globales a toda la instancia); valores explícitos, sin depender de defaults.
--       - Nota TLS: la cookie Secure exige HTTPS y el despliegue actual es HTTP (puerto 3000).
--       - Deuda registrada: M4 (CI de migraciones) y M5 (rotación de contraseña).
--
-- DECISIONES DE DISEÑO (tras revisión de arquitectura):
--   1. pgcrypto + bcrypt: el hash se calcula DENTRO de PostgreSQL
--      (crypt/gen_salt). Cero dependencias npm, cero RAM adicional, cero
--      cambios en la imagen de n8n. Formato: $2a$10$...
--   2. Solo se almacena el hash. CHECK con regex estricta como red de seguridad
--      contra texto plano (la versión v1 usaba LIKE '$%' y no protegía nada).
--   3. Sesión con token opaco de 256 bits; en la BD solo el SHA-256 del token.
--      Permite revocación real (logout y activo=false surten efecto inmediato).
--   4. Email único sin distinguir mayúsculas: CHECK de minúsculas + índice
--      único sobre lower(email). No requiere citext.
--   5. Bloqueo por fuerza bruta corregido: al vencer el bloqueo, el contador
--      vuelve a 0 (la v1 dejaba al usuario con 1 intento cada 15 min para
--      siempre, sin salida sin intervención de un administrador).
--   6. Anti-enumeración: fn_usuario_autenticar ejecuta un crypt() señuelo
--      cuando el correo no existe, para que el tiempo de respuesta no delate
--      si una cuenta está registrada.
--   7. Sin alta pública: los usuarios los crea un administrador. Esta
--      migración NO inserta usuarios ni contraseñas (los secretos no viajan
--      en el repo).
--   8. Migración aditiva e idempotente: no modifica ni borra tablas existentes.
-- ─────────────────────────────────────────────────────────────────────────────

-- pgcrypto: extensión oficial de PostgreSQL. Requiere superusuario (POSTGRES_USER
-- lo es, por ser el owner inicial del contenedor). bcrypt vía gen_salt('bf').
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  TABLA — usuario                                                        ║
-- ║  Granularidad: 1 fila = 1 cuenta que puede iniciar sesión.              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS usuario (
    id_usuario             BIGSERIAL    PRIMARY KEY,
    email                  TEXT         NOT NULL,
    password_hash          TEXT         NOT NULL,
    rol                    TEXT         NOT NULL DEFAULT 'analista',
    activo                 BOOLEAN      NOT NULL DEFAULT TRUE,
    intentos_fallidos      INT          NOT NULL DEFAULT 0,
    bloqueado_hasta        TIMESTAMPTZ,
    ultimo_login           TIMESTAMPTZ,
    -- La cuenta inicial se crea desde variables de entorno; con esta marca el
    -- administrador puede forzar el cambio en el primer login.
    debe_cambiar_password  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT ck_usuario_email_minusculas CHECK (email = lower(btrim(email))),
    CONSTRAINT ck_usuario_email_no_vacio    CHECK (btrim(email) <> ''),
    CONSTRAINT ck_usuario_email_formato     CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    -- Red de seguridad real contra guardar texto plano: exige el prefijo
    -- bcrypt completo ($2a$10$...). 'LIKE ''$%''' (v1) aceptaba '$$$$$' y no
    -- cumplía su propósito.
    CONSTRAINT ck_usuario_hash_bcrypt       CHECK (password_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'),
    CONSTRAINT ck_usuario_rol               CHECK (rol IN ('analista', 'admin')),
    CONSTRAINT ck_usuario_intentos          CHECK (intentos_fallidos >= 0),
    CONSTRAINT ck_usuario_bloqueo           CHECK (bloqueado_hasta IS NULL OR bloqueado_hasta > created_at)
);

-- Índice único sobre la expresión: la unicidad es case-insensitive.
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_email ON usuario (lower(email));

COMMENT ON TABLE usuario IS
    'Cuentas del sistema (login, HU-6). Solo se almacena el hash bcrypt; el hash se '
    'genera en PostgreSQL con pgcrypto (crypt/gen_salt). No hay registro público: las '
    'cuentas las crea un administrador.';
COMMENT ON COLUMN usuario.password_hash IS
    'Hash bcrypt ($2a$NN$...) calculado por fn_usuario_hash(). Nunca se guarda texto '
    'plano y el hash nunca se devuelve al frontend ni a un workflow de n8n. OJO: la '
    'contraseña en claro SÍ atraviesa n8n en el webhook de login (ver nota R1 en FLUJO DE LOGIN).';
COMMENT ON COLUMN usuario.rol IS
    'analista = consulta e históricos; admin = además administra cuentas.';
COMMENT ON COLUMN usuario.intentos_fallidos IS
    'Contraseñas erróneas consecutivas en la ventana actual. Lo fija y reinicia '
    'fn_usuario_registrar_exito(); la política (máximo y minutos) la pasa @healthradar/core.';
COMMENT ON COLUMN usuario.bloqueado_hasta IS
    'Si es futuro, el login se rechaza con 401 genérico hasta esa hora. Al vencer, '
    'fn_usuario_registrar_fallo() reinicia el contador en la ventana siguiente.';
COMMENT ON COLUMN usuario.updated_at IS
    'Última modificación de la cuenta (cambio de contraseña, bloqueo, activación).';

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  TABLA — sesion                                                         ║
-- ║  Granularidad: 1 fila = 1 sesión iniciada por un usuario.               ║
-- ║  POR QUÉ EXISTE: permite que logout y activo=false surtan efecto          ║
-- ║  inmediato. Con cookie firmada el token seguiría siendo válido hasta     ║
-- ║  expirar. Costo: 3 KB por sesión, 0 RAM adicional, 0 contenedores.       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS sesion (
    id_sesion    BIGSERIAL    PRIMARY KEY,
    id_usuario   BIGINT       NOT NULL REFERENCES usuario (id_usuario) ON DELETE CASCADE,
    -- SHA-256 del token, NUNCA el token. Si se filtra la BD no se pueden
    -- suplantar sesiones (el token es aleatorio de 256 bits).
    token_hash   TEXT         NOT NULL,
    creada_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expira_at    TIMESTAMPTZ  NOT NULL,
    revocada_at  TIMESTAMPTZ,
    ip           TEXT,
    user_agent   TEXT,

    CONSTRAINT uq_sesion_token_hash UNIQUE (token_hash),
    CONSTRAINT ck_sesion_expira      CHECK (expira_at > creada_at),
    CONSTRAINT ck_sesion_revocacion  CHECK (revocada_at IS NULL OR revocada_at >= creada_at)
);

-- Sesiones vivas de un usuario (logout, "salir en todos los dispositivos").
CREATE INDEX IF NOT EXISTS idx_sesion_usuario_viva ON sesion (id_usuario) WHERE revocada_at IS NULL;
-- Permite purgar sesiones vencidas sin recorrer la tabla.
CREATE INDEX IF NOT EXISTS idx_sesion_expira        ON sesion (expira_at);

COMMENT ON TABLE sesion IS
    'Sesiones activas. La cookie lleva el token opaco (httpOnly, Secure, SameSite=Lax); '
    'aquí solo se guarda su SHA-256. Verificar siempre contra esta tabla para que logout '
    'y la desactivación de la cuenta surtan efecto inmediato.';
COMMENT ON COLUMN sesion.token_hash IS
    'SHA-256 (hex) del token de la cookie. Nunca el token en claro.';

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  TABLA — login_evento (bitácora de accesos)                             ║
-- ║  Granularidad: 1 fila = 1 intento de login (correcto o fallido).        ║
-- ║  Auditoría de accesos de DevSecOps (S3-07) y detección por IP.         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS login_evento (
    id_evento       BIGSERIAL    PRIMARY KEY,
    id_usuario      BIGINT       REFERENCES usuario (id_usuario) ON DELETE SET NULL,
    email_intento   TEXT         NOT NULL,  -- tal como se intentó (puede no existir)
    exito           BOOLEAN      NOT NULL,
    motivo          TEXT,                    -- 'ok' | 'credenciales' | 'bloqueado' | 'no_existe'
    ip              TEXT,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- v1 dejaría email_intento sin normalizar y la bitácora quedaría fragmentada
    -- por mayúsculas; la normalización la aplica el flujo, no un CHECK.
    CONSTRAINT ck_login_evento_motivo CHECK (
        motivo IS NULL OR motivo IN ('ok', 'credenciales', 'bloqueado', 'no_existe')
    )
);

CREATE INDEX IF NOT EXISTS idx_login_evento_ip_fecha      ON login_evento (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_evento_usuario_fecha ON login_evento (id_usuario, created_at DESC);
-- La bitácora no se acota sola: PostgreSQL tiene mem_limit 768m. Purgar con
-- fn_auth_purgar() (llamar desde un workflow programado existente).
CREATE INDEX IF NOT EXISTS idx_login_evento_fecha        ON login_evento (created_at);

COMMENT ON TABLE login_evento IS
    'Bitácora de intentos de login. Nunca guarda contraseñas. id_usuario es NULL si el '
    'correo no existe o la cuenta fue eliminada (ON DELETE SET NULL preserva la auditoría).';
COMMENT ON COLUMN login_evento.motivo IS
    'Motivo interno. Lo decide el flujo: login correcto = ok; fn_usuario_registrar_fallo con '
    '0 filas = no_existe; con bloqueado=true = bloqueado; en otro caso = credenciales. '
    'No existe un motivo "inactivo": una cuenta inactiva es indistinguible de una clave mala '
    '(así no se revela su estado). La respuesta al navegador es SIEMPRE 401 genérico; este '
    'campo nunca se expone al frontend (anti-enumeración de cuentas).';
COMMENT ON COLUMN login_evento.ip IS
    'Leer X-Real-IP / X-Forwarded-For de nginx (nginx.conf los setea). NO usar '
    'request.ip del router de Next.js o se registrará la IP del contenedor proxy.';

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  FUNCIONES — criptografía y atomicidad (ADR-012: núcleo de datos)         ║
-- ║  La POLÍTICA (5 intentos, 15 min, TTL, mensaje genérico) la decide      ║
-- ║  @healthradar/core y llega aquí como parámetro. Estas funciones son      ║
-- ║  pequeñas, deterministas y sin lógica de negocio.                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Genera el hash de una contraseña. Uso único: script semilla / cambio de contraseña.
CREATE OR REPLACE FUNCTION fn_usuario_hash(p_password TEXT)
RETURNS TEXT AS $$
    SELECT crypt(p_password, gen_salt('bf', 10));
$$ LANGUAGE sql VOLATILE;

COMMENT ON FUNCTION fn_usuario_hash(TEXT) IS
    'Devuelve el hash bcrypt ($2a$10$...) de la contraseña. El texto plano jamás '
    'se almacena ni se registra en logs.';

-- Verifica credenciales. Devuelve 0 filas si el correo no existe, la contraseña
-- no coincide, la cuenta está inactiva o está bloqueada. El flujo translate
-- los 0 filas a 401 genérico.
CREATE OR REPLACE FUNCTION fn_usuario_autenticar(p_email TEXT, p_password TEXT)
RETURNS TABLE (id_usuario BIGINT, email TEXT, rol TEXT)
AS $$
DECLARE
    v_email  TEXT := lower(btrim(p_email));
    v_id     BIGINT;
    v_hash   TEXT;
    v_rol    TEXT;
    v_activo BOOLEAN;
    v_bloq   TIMESTAMPTZ;
    v_ok     BOOLEAN;
BEGIN
    -- 1) Buscar la cuenta por correo (usa uq_usuario_email). NO se evalúa bcrypt
    --    dentro del WHERE: el planificador puede ordenar las condiciones de modo que
    --    crypt() corra sobre cada fila (con 31 usuarios un login tardaba ~1.9 s).
    SELECT u.id_usuario, u.password_hash, u.rol, u.activo, u.bloqueado_hasta
      INTO v_id, v_hash, v_rol, v_activo, v_bloq
      FROM usuario u
     WHERE lower(u.email) = v_email;

    -- 2) Anti-enumeración: EXACTAMENTE un crypt() en todas las rutas
    --    (cuenta inexistente = señuelo; existente = verificación real).
    --    El coste del señuelo debe igualar al de fn_usuario_hash (bf, 10).
    IF v_id IS NULL THEN
        PERFORM crypt(p_password, gen_salt('bf', 10));
        RETURN;
    END IF;

    v_ok := (crypt(p_password, v_hash) = v_hash);

    IF v_ok AND v_activo AND (v_bloq IS NULL OR v_bloq <= now()) THEN
        RETURN QUERY SELECT v_id, v_email, v_rol;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;  -- gen_salt() es VOLATILE: el contrato debe coincidir

COMMENT ON FUNCTION fn_usuario_autenticar(TEXT,TEXT) IS
    'Verifica credenciales. 0 filas = acceso denegado por cualquier causa. Incluye un '
    'crypt() señuelo en la ruta negativa para que el tiempo de respuesta no revele si el '
    'correo está registrado. La respuesta al navegador es 401 genérico en todos los casos.';

-- Registra un intento fallido y devuelve el estado de bloqueo resultante.
-- CORRECCIÓN PRINCIPAL: cuando el bloqueo ya venció, el contador vuelve a 0.
CREATE OR REPLACE FUNCTION fn_usuario_registrar_fallo(
    p_email           TEXT,
    p_max_intentos    INT    DEFAULT 5,
    p_bloqueo_minutos INT    DEFAULT 15
)
RETURNS TABLE (id_usuario BIGINT, intentos INT, bloqueado BOOLEAN)
AS $$
BEGIN
    -- Un único UPDATE: el bloqueo de fila de PostgreSQL serializa los intentos
    -- concurrentes (la versión SELECT + UPDATE perdía incrementos: 40 fallos en
    -- paralelo se contaban como 21, lo que permite saltarse el bloqueo).
    -- Las expresiones del SET leen la fila ANTERIOR.
    RETURN QUERY
    UPDATE usuario u
       SET intentos_fallidos =
             CASE WHEN u.bloqueado_hasta IS NOT NULL AND u.bloqueado_hasta > now()
                  THEN u.intentos_fallidos        -- bloqueo vigente: no se incrementa
                  WHEN u.bloqueado_hasta IS NOT NULL AND u.bloqueado_hasta <= now()
                  THEN 1                          -- el bloqueo venció: ventana nueva
                  ELSE u.intentos_fallidos + 1 END,
           bloqueado_hasta =
             CASE
               -- Ya bloqueado y vigente: NO se extiende (si no, un atacante mantiene
               -- bloqueada a la víctima indefinidamente).
               WHEN u.bloqueado_hasta IS NOT NULL AND u.bloqueado_hasta > now()
                    THEN u.bloqueado_hasta
               WHEN (CASE WHEN u.bloqueado_hasta IS NOT NULL AND u.bloqueado_hasta <= now()
                          THEN 1 ELSE u.intentos_fallidos + 1 END) >= p_max_intentos
                    THEN now() + make_interval(mins => p_bloqueo_minutos)
               ELSE NULL
             END,
           updated_at = now()
     WHERE u.email = lower(btrim(p_email))
    RETURNING u.id_usuario,
              u.intentos_fallidos,
              (u.bloqueado_hasta IS NOT NULL AND u.bloqueado_hasta > now());
    -- Correo inexistente: 0 filas (la bitácora la escribe el flujo con motivo 'no_existe').
END;
$$ LANGUAGE plpgsql VOLATILE;

COMMENT ON FUNCTION fn_usuario_registrar_fallo(TEXT,INT,INT) IS
    'Suma un intento fallido de forma atómica y devuelve el estado de bloqueo. '
    'Al vencer el bloqueo, el contador se reinicia (ventana nueva de p_max_intentos). '
    'La política la pasa @healthradar/core, no está hardcodeada en SQL.';

-- Registra un intento exitoso: reinicia contador y bloqueo.
CREATE OR REPLACE FUNCTION fn_usuario_registrar_exito(p_email TEXT)
RETURNS TABLE (id_usuario BIGINT, email TEXT, rol TEXT)
AS $$
BEGIN
    RETURN QUERY
    UPDATE usuario u
       SET intentos_fallidos   = 0,
           bloqueado_hasta     = NULL,
           ultimo_login        = now(),
           updated_at          = now()
     WHERE u.email = lower(btrim(p_email))
    RETURNING u.id_usuario, u.email, u.rol;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Crea la sesión tras un login válido. El token lo genera @healthradar/core
-- (crypto.randomBytes(32)); aquí solo se persiste su SHA-256.
CREATE OR REPLACE FUNCTION fn_sesion_crear(
    p_token_hash  TEXT,
    p_id_usuario  BIGINT,
    p_ttl_minutos INT,
    p_ip          TEXT DEFAULT NULL,
    p_user_agent  TEXT DEFAULT NULL
)
RETURNS TABLE (id_sesion BIGINT, id_usuario BIGINT, expira_at TIMESTAMPTZ)
AS $$
BEGIN
    RETURN QUERY
    INSERT INTO sesion (id_usuario, token_hash, expira_at, ip, user_agent)
    VALUES (p_id_usuario, p_token_hash,
            now() + make_interval(mins => p_ttl_minutos), p_ip, p_user_agent)
    RETURNING sesion.id_sesion, sesion.id_usuario, sesion.expira_at;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Valida el token de la cookie. Única fuente de verdad de "quién es el usuario":
-- respeta revocada_at, expira_at y usuario.activo.
-- (LANGUAGE plpgsql: BEGIN/RETURN QUERY no es válido en LANGUAGE sql)
CREATE OR REPLACE FUNCTION fn_sesion_validar(p_token_hash TEXT)
RETURNS TABLE (id_usuario BIGINT, email TEXT, rol TEXT, expira_at TIMESTAMPTZ)
AS $$
BEGIN
    RETURN QUERY
    SELECT u.id_usuario, u.email, u.rol, s.expira_at
      FROM sesion s
      JOIN usuario u ON u.id_usuario = s.id_usuario
     WHERE s.token_hash = p_token_hash
       AND s.revocada_at IS NULL
       AND s.expira_at > now()
       AND u.activo;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION fn_sesion_validar(TEXT) IS
    'Resuelve el token de la cookie a un usuario vigente. Se invoca en cada petición '
    'protegida (vía nginx auth_request contra mf-consulta/api/auth/sesion). Retorna 0 filas '
    'si la sesión está revocada, expirada o el usuario fue desactivado.';

-- Logout.
CREATE OR REPLACE FUNCTION fn_sesion_revocar(p_token_hash TEXT)
RETURNS BOOLEAN AS $$
    WITH upd AS (
        UPDATE sesion s
           SET revocada_at = now()
         WHERE s.token_hash = p_token_hash
           AND s.revocada_at IS NULL
        RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM upd);
$$ LANGUAGE sql VOLATILE;

-- Cierre de sesión en todos los dispositivos.
CREATE OR REPLACE FUNCTION fn_sesion_revocar_todas(p_id_usuario BIGINT)
RETURNS INT AS $$
    WITH upd AS (
        UPDATE sesion s
           SET revocada_at = now()
         WHERE s.id_usuario = p_id_usuario
           AND s.revocada_at IS NULL
        RETURNING 1
    )
    SELECT count(*)::INT FROM upd;
$$ LANGUAGE sql VOLATILE;

-- Mantenimiento: purga sesiones cerradas/vencidas y bitácora antigua.
-- Pensado para un workflow programado existente (n8n no necesita RAM extra).
CREATE OR REPLACE FUNCTION fn_auth_purgar(
    p_dias_sesion  INT DEFAULT 30,
    p_dias_eventos INT DEFAULT 180
) RETURNS TABLE (sesiones_borradas BIGINT, eventos_borrados BIGINT) AS $$
DECLARE
    v_s INT;
    v_e BIGINT;
BEGIN
    DELETE FROM sesion
     WHERE (revocada_at IS NOT NULL AND revocada_at < now() - make_interval(days => p_dias_sesion))
        OR (expira_at < now() - make_interval(days => p_dias_sesion));
    GET DIAGNOSTICS v_s = ROW_COUNT;

    DELETE FROM login_evento
     WHERE created_at < now() - make_interval(days => p_dias_eventos);
    GET DIAGNOSTICS v_e = ROW_COUNT;

    RETURN QUERY SELECT v_s::BIGINT, v_e;
END;
$$ LANGUAGE plpgsql VOLATILE;

COMMENT ON FUNCTION fn_auth_purgar(INT,INT) IS
    'Mantenimiento de tablas de autenticación. Llamar desde un workflow programado '
    'para acotar el crecimiento (PostgreSQL tiene mem_limit 768m).';

-- ─────────────────────────────────────────────────────────────────────────────
-- FLUJO DE LOGIN (HU-6) — el navegador nunca ve el webhook (ADR-004)
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. POST /api/auth/login  (mf-consulta, server-side, lee X-Real-IP de nginx)
-- 2. mf-consulta → POST n8n/webhook/auth-login  con Header Auth desde .env
-- 3. nodo Code: require('@healthradar/core').autenticarLogin({...})   [política]
-- 4. nodo PostgreSQL → fn_usuario_autenticar / fn_usuario_registrar_*
-- 5. Respond to Webhook → { ok, token, rol, expira_en_seg }
-- 6. mf-consulta responde 200 + Set-Cookie: hr_sesion=<token>;
--      HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=<ttl>
--
-- R1 — LA CONTRASEÑA EN CLARO ATRAVIESA n8n (obligatorio al desplegar):
--   La contraseña entra por el webhook del paso 2 y el nodo PostgreSQL la pasa a
--   fn_usuario_autenticar. Aunque aquí solo se guarde el hash, n8n persiste los datos
--   de ejecución en la misma base, y ahí quedaría el texto plano. Por eso, ANTES de
--   activar el workflow de login, el workflow de auth NO debe guardar ejecuciones.
--
--   RECOMENDADO — configuración POR WORKFLOW (solo afecta al workflow de auth):
--     Workflow → Settings: "Save failed production executions" = Do not save
--                          "Save successful production executions" = Do not save
--                          "Save manual executions" = off
--     (en el JSON del workflow: settings.saveDataErrorExecution = "none",
--      settings.saveDataSuccessExecution = "none", settings.saveManualExecutions = false)
--   Un login fallido cuenta como error: por eso también se desactiva el de errores.
--   El resto de workflows (ingesta, NLQ, reportes) conserva su historial de ejecuciones.
--
--   ALTERNATIVA — variables GLOBALES de n8n (solo si no se puede garantizar lo anterior):
--     EXECUTIONS_DATA_SAVE_ON_SUCCESS=none
--     EXECUTIONS_DATA_SAVE_ON_ERROR=none
--     EXECUTIONS_DATA_SAVE_ON_PROGRESS=false
--     EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=false
--   OJO: son globales a TODA la instancia: SAVE_ON_ERROR=none borra el historial de errores
--   de todos los workflows y quita la depuración de los demás.
--   Higiene (válida con cualquiera de las dos): EXECUTIONS_DATA_PRUNE=true con
--   EXECUTIONS_DATA_MAX_AGE (horas) y EXECUTIONS_DATA_PRUNE_MAX_COUNT explícitos; también
--   globales, así que fijarlos según lo que QA necesite conservar de los demás workflows.
--   Valores explícitos a propósito: un control de seguridad no puede depender de los
--   defaults de n8n. Nombres y unidades por confirmar contra la documentación de la
--   versión desplegada (n8n 2.35.7) y comprobar con
--   `docker exec healthradar-n8n printenv | grep EXECUTIONS_DATA`.
--   Y el workflow de auth no debe tener nodos que registren el body (Log, Debug,
--   notificaciones de error con el payload). Esta nota NO cierra R1: la mitigación
--   vive en docker-compose.yml y en el workflow, no en este .sql.
--
-- TLS / COOKIE Secure — DECISIÓN PENDIENTE (va en el ADR-014):
--   El despliegue actual sirve HTTP plano (nginx escucha en 3000, sin ssl_certificate ni
--   listen 443; docker-compose publica "3000:3000"). Un navegador DESCARTA las cookies
--   Secure cuando la página llega por HTTP: el login respondería 200, el Set-Cookie se
--   ignoraría y nadie podría entrar. Además, con HTTP la contraseña viaja en claro por la
--   red. Antes de activar el workflow hay que elegir UNA opción:
--     (a) TLS en nginx (requiere dominio + certificado; la RAM extra es ~0), cookie Secure; o
--     (b) cookie SIN Secure, documentada como RIESGO ACEPTADO solo para la demo en VM con IP.
--   Hasta decidirlo, el atributo Secure del paso 6 NO debe darse por funcionando.
--
-- R2 — ESTE ARCHIVO NO ES IDEMPOTENTE PARA EL PIPELINE:
--   Que 008 se pueda aplicar dos veces (paso 8) sirve para aplicarla A MANO. El paso 2.5 de
--   n8n-deploy-cd.yml omite los archivos ya registrados en healthradar_schema_migrations y
--   registra la migración aunque falle: una aplicación a medias queda marcada como hecha y
--   no se reintenta. Tras desplegar, verificar a mano (paso 8 y la consulta de funciones) y,
--   si falló, re-aplicar manualmente. No existe todavía CI que valide las migraciones.
--
-- DEUDA TÉCNICA (registrar en el ADR-014 / matriz del Sprint 4):
--   M4  CI de migraciones: aplicar 001–008 dos veces contra un Postgres efímero en cada PR
--       y sacar el paso 2.5 a su propio workflow (cierra R2 de raíz).
--   M5  Rotación / cambio de contraseña: hoy solo existe debe_cambiar_password; falta el
--       flujo y la política (caducidad, historial) que la use.
--
-- MOTIVO en login_evento (lo decide el flujo con lo que devuelve la BD):
--   registrar_fallo devuelve 0 filas      -> 'no_existe'
--   registrar_fallo devuelve bloqueado=t  -> 'bloqueado'
--   en otro caso                          -> 'credenciales'
--   login correcto                        -> 'ok'
--
-- LOGIN FALLIDO (siempre 401 genérico, nunca "usuario no existe"):
--   fn_usuario_autenticar → 0 filas
--   fn_usuario_registrar_fallo(email, 5, 15)
--   INSERT INTO login_evento (id_usuario, email_intento, exito, motivo, ip)
--   VALUES ($id_usuario, lower(btrim($email)), FALSE, $motivo, $ip);
--   -- $motivo según el mapeo de arriba ('no_existe' | 'bloqueado' | 'credenciales');
--   -- $id_usuario es NULL cuando el motivo es 'no_existe'.
--
-- LOGIN EXITOSO:
--   fn_usuario_registrar_exito(email)
--   INSERT INTO login_evento (...) VALUES ($id_usuario, $email, TRUE, 'ok', $ip);
--   token = crypto.randomBytes(32).toString('hex')        [en @healthradar/core]
--   fn_sesion_crear(<sha256(token) en hex>, $id_usuario, 480, $ip, $ua)
--
-- LOGOUT:
--   fn_sesion_revocar(<sha256(token) en hex>)
--
-- Petición protegida (protege / y /historicos sin duplicar código en 2 MFs):
--   nginx.conf: auth_request /_auth;
--   location = /_auth { internal; proxy_pass http://mf_consulta/api/auth/sesion;
--                        proxy_pass_request_body off;
--                        proxy_set_header Cookie $http_cookie; }
--   mf-consulta: SELECT * FROM fn_sesion_validar(<sha256(cookie) en hex>) → 200 o 401
--   (la imagen oficial nginx:1.27-alpine incluye ngx_http_auth_request_module;
--    excluir de auth_request: /_next/static/*, /api/auth/* Y la página /login)
--
-- ALTA DE CUENTAS (script aparte, secretos desde variables de entorno):
--   INSERT INTO usuario (email, password_hash, rol, debe_cambiar_password)
--   SELECT lower(btrim($1)), fn_usuario_hash($2), $3, TRUE
--   ON CONFLICT ((lower(email))) DO NOTHING;
--   -- OJO: doble paréntesis. El índice único es sobre la EXPRESIÓN lower(email),
--   --      no sobre la columna; con ON CONFLICT (email) falla la migración.
--
-- PERMISOS: hoy n8n y Phoenix se autentican como POSTGRES_USER, que es el owner
-- de la base y por tanto puede leer password_hash. Crear roles separados es una
-- decisión de infraestructura (nueva migración + cambio de credenciales en
-- docker-compose.yml), NO de este archivo. Ver informe de revisión, hallazgos C2 y C3.
-- ─────────────────────────────────────────────────────────────────────────────

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  VERIFICACIÓN MANUAL POST-MIGRACIÓN (no se ejecuta; cada paso fue probado)║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--   Usa una cuenta de prueba y al final límpiala (paso 7). Contraseñas de
--   prueba, nunca de producción.
--
--   -- 1. El CHECK del hash rechaza texto plano y formatos falsos:
--   INSERT INTO usuario (email, password_hash) VALUES ('x@y.com', 'secreto');   -- ERROR ck_usuario_hash_bcrypt
--   INSERT INTO usuario (email, password_hash) VALUES ('x@y.com', '$$$$$$$$');  -- ERROR ck_usuario_hash_bcrypt
--
--   -- 2. Alta de la cuenta de prueba y verificación del hash (debe dar t):
--   INSERT INTO usuario (email, password_hash)
--   VALUES ('prueba@healthradar.pe', fn_usuario_hash('Prueba#123'));
--   SELECT password_hash = crypt('Prueba#123', password_hash) FROM usuario
--    WHERE email = 'prueba@healthradar.pe';
--
--   -- 3. Autenticación (1 fila con la clave buena, 0 con la mala):
--   SELECT count(*) FROM fn_usuario_autenticar('prueba@healthradar.pe', 'Prueba#123');  -- 1
--   SELECT count(*) FROM fn_usuario_autenticar('prueba@healthradar.pe', 'mala');        -- 0
--
--   -- 4. Bloqueo (máx. 3, 15 min): el 3.er fallo bloquea; con la cuenta
--   --    bloqueada el contador ya NO sube y el bloqueo NO se extiende:
--   SELECT * FROM fn_usuario_registrar_fallo('prueba@healthradar.pe', 3, 15);  -- 1, f
--   SELECT * FROM fn_usuario_registrar_fallo('prueba@healthradar.pe', 3, 15);  -- 2, f
--   SELECT * FROM fn_usuario_registrar_fallo('prueba@healthradar.pe', 3, 15);  -- 3, t
--   SELECT * FROM fn_usuario_registrar_fallo('prueba@healthradar.pe', 3, 15);  -- 3, t (sin cambio)
--   SELECT count(*) FROM fn_usuario_autenticar('prueba@healthradar.pe', 'Prueba#123');  -- 0 (bloqueada)
--
--   -- 5. Al vencer el bloqueo, ventana nueva. Se simula con created_at + 1 µs
--   --    (now() - 1 s puede violar ck_usuario_bloqueo si la cuenta es recién creada):
--   UPDATE usuario SET bloqueado_hasta = created_at + interval '1 microsecond'
--    WHERE email = 'prueba@healthradar.pe';
--   SELECT * FROM fn_usuario_registrar_fallo('prueba@healthradar.pe', 3, 15);  -- 1, f
--
--   -- 6. Sesión: el token de la cookie se guarda como SHA-256 en HEX (texto):
--   SELECT * FROM fn_sesion_crear(encode(sha256('token-de-prueba'::bytea), 'hex'),
--            (SELECT id_usuario FROM usuario WHERE email = 'prueba@healthradar.pe'), 480);
--   SELECT count(*) FROM fn_sesion_validar(encode(sha256('token-de-prueba'::bytea), 'hex'));  -- 1
--   SELECT fn_sesion_revocar(encode(sha256('token-de-prueba'::bytea), 'hex'));                -- t
--   SELECT count(*) FROM fn_sesion_validar(encode(sha256('token-de-prueba'::bytea), 'hex'));  -- 0
--
--   -- 7. LIMPIEZA (la sesión cae por ON DELETE CASCADE, pero login_evento NO: su
--   --    id_usuario pasa a NULL por ON DELETE SET NULL; se borran aparte, antes o después):
--   DELETE FROM login_evento WHERE email_intento = 'prueba@healthradar.pe';
--   DELETE FROM usuario      WHERE email         = 'prueba@healthradar.pe';
--
--   -- 8. IDEMPOTENCIA (aplicación manual): aplicar ESTE archivo dos veces seguidas, una
--   --    sobre una base en blanco (con 001–007) y otra sobre una base donde 008 ya está
--   --    aplicada. Ambas deben terminar sin errores (solo NOTICE "already exists, skipping").
--   --    Postgres no publica puerto al host (ADR-008) y el host no tiene psql. Se copia el
--   --    archivo al contenedor y se aplica con -f (sin pipe: evita problemas de codificación
--   --    de PowerShell 5.1 con los acentos UTF-8 de los literales). Desde la carpeta del archivo:
--   --      # Usuario y base: los de docker-compose (POSTGRES_USER / POSTGRES_DB), tomados del contenedor
--   --      PG_USER=$(docker exec healthradar-postgres printenv POSTGRES_USER)
--   --      PG_DB=$(docker exec healthradar-postgres printenv POSTGRES_DB)
--   --      docker cp 008_autenticacion_usuarios.sql healthradar-postgres:/tmp/008.sql
--   --      docker exec healthradar-postgres psql -v ON_ERROR_STOP=1 -q -U "$PG_USER" -d "$PG_DB" -f /tmp/008.sql
--   --      docker exec healthradar-postgres psql -v ON_ERROR_STOP=1 -q -U "$PG_USER" -d "$PG_DB" -f /tmp/008.sql
--   --      docker exec -u root healthradar-postgres rm /tmp/008.sql
--   --    (PowerShell: $PG_USER = docker exec healthradar-postgres printenv POSTGRES_USER; igual para $PG_DB;
--   --     los demás comandos no cambian.) NO copiar las credenciales hardcodeadas de
--   --     test_poc_adr008.ps1 (healthradar_admin / healthradar_db).
--   --    Para la prueba "en blanco" usa una base de pruebas, nunca la de producción.
