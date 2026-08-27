-- ==============================================================================
-- MIGRACIÓN 002 — Modelo ER real de dominio epidemiológico
-- Proyecto: HealthRadar — Célula 5
-- Precondición: La migración 001 ya fue aplicada (pgvector activo).
-- Esta migración ELIMINA las tablas de la PoC con datos simulados y crea
-- el modelo de dominio real con datos del MINSA.
-- ==============================================================================

-- ---------------------------------------------------------------------------
-- 0. LIMPIEZA — Eliminar tablas de la PoC con datos simulados
-- ---------------------------------------------------------------------------

-- Índices de las tablas PoC
DROP INDEX IF EXISTS idx_reportes_embedding_hnsw;
DROP INDEX IF EXISTS idx_casos_distrito_semana;
DROP INDEX IF EXISTS idx_casos_enfermedad;
DROP INDEX IF EXISTS idx_clima_distrito_semana;

-- Tablas PoC (CASCADE por si hay dependencias)
DROP TABLE IF EXISTS reportes_embeddings    CASCADE;
DROP TABLE IF EXISTS casos_epidemiologicos  CASCADE;
DROP TABLE IF EXISTS datos_climaticos       CASCADE;

-- ---------------------------------------------------------------------------
-- 1. GEOGRAFÍA
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS departamento (
    id_departamento CHAR(2)     PRIMARY KEY,
    nombre          VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS provincia (
    id_provincia    CHAR(4)     PRIMARY KEY,
    nombre          VARCHAR(50) NOT NULL,
    id_departamento CHAR(2)     NOT NULL REFERENCES departamento(id_departamento),
    UNIQUE (nombre, id_departamento)
);

CREATE TABLE IF NOT EXISTS distrito (
    ubigeo       CHAR(6)     PRIMARY KEY,
    nombre       VARCHAR(50) NOT NULL,
    id_provincia CHAR(4)     NOT NULL REFERENCES provincia(id_provincia),
    UNIQUE (nombre, id_provincia)
);

-- ---------------------------------------------------------------------------
-- 2. TIEMPO
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS periodo_epidemiologico (
    id_periodo SERIAL   PRIMARY KEY,
    anio       SMALLINT NOT NULL CHECK (anio BETWEEN 1990 AND 2100),
    semana     SMALLINT NOT NULL CHECK (semana BETWEEN 1 AND 53),
    UNIQUE (anio, semana)
);

-- ---------------------------------------------------------------------------
-- 3. DIRECCIÓN DE SALUD
-- sub_reg_nt (EDA/IRA) y diresa (Dengue) son el mismo catálogo confirmado.
-- codigo_origen almacena el entero tal como viene del archivo fuente.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS direccion_salud (
    id_diresa     SERIAL PRIMARY KEY,
    codigo_origen INT    NOT NULL UNIQUE
);

-- ---------------------------------------------------------------------------
-- 4. EDA — Enfermedades Diarreicas Agudas
-- Granularidad: 1 fila = 1 distrito + 1 semana + 1 grupo etario
-- grupo_etario: '<5' (menores de 5 años) o '>=5' (5 años o más)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS caso_eda (
    id_caso_eda    BIGSERIAL  PRIMARY KEY,
    ubigeo         CHAR(6)    NOT NULL REFERENCES distrito(ubigeo),
    id_periodo     INT        NOT NULL REFERENCES periodo_epidemiologico(id_periodo),
    id_diresa      INT        REFERENCES direccion_salud(id_diresa),
    grupo_etario   VARCHAR(5) NOT NULL CHECK (grupo_etario IN ('<5', '>=5')),
    episodios      INT        CHECK (episodios >= 0),
    hospitalizados INT        CHECK (hospitalizados >= 0),
    defunciones    INT        CHECK (defunciones >= 0),
    UNIQUE (ubigeo, id_periodo, grupo_etario)
);

CREATE INDEX IF NOT EXISTS idx_eda_ubigeo_periodo
    ON caso_eda (ubigeo, id_periodo);

-- ---------------------------------------------------------------------------
-- 5. IRA — Neumonía
-- Granularidad: 1 fila = 1 distrito + 1 semana + 1 grupo etario
-- grupo_etario: '<5' (menores de 5 años) o '>60' (mayores de 60 años)
-- Nota: los cortes de edad de IRA difieren de EDA (no es >=5 sino >60)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS caso_ira_neumonia (
    id_caso_ira    BIGSERIAL  PRIMARY KEY,
    ubigeo         CHAR(6)    NOT NULL REFERENCES distrito(ubigeo),
    id_periodo     INT        NOT NULL REFERENCES periodo_epidemiologico(id_periodo),
    id_diresa      INT        REFERENCES direccion_salud(id_diresa),
    grupo_etario   VARCHAR(5) NOT NULL CHECK (grupo_etario IN ('<5', '>60')),
    casos_neumonia INT        CHECK (casos_neumonia >= 0),
    hospitalizados INT        CHECK (hospitalizados >= 0),
    defunciones    INT        CHECK (defunciones >= 0),
    UNIQUE (ubigeo, id_periodo, grupo_etario)
);

CREATE INDEX IF NOT EXISTS idx_ira_neumonia_ubigeo_periodo
    ON caso_ira_neumonia (ubigeo, id_periodo);

-- ---------------------------------------------------------------------------
-- 6. IRA — No neumonía
-- Granularidad: 1 fila = 1 distrito + 1 semana (siempre <5 años, sin columna)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS caso_ira_no_neumonia (
    id_caso_ira_nn BIGSERIAL PRIMARY KEY,
    ubigeo         CHAR(6)   NOT NULL REFERENCES distrito(ubigeo),
    id_periodo     INT       NOT NULL REFERENCES periodo_epidemiologico(id_periodo),
    id_diresa      INT       REFERENCES direccion_salud(id_diresa),
    casos          INT       CHECK (casos >= 0),
    UNIQUE (ubigeo, id_periodo)
);

CREATE INDEX IF NOT EXISTS idx_ira_no_neumonia_ubigeo_periodo
    ON caso_ira_no_neumonia (ubigeo, id_periodo);

-- ---------------------------------------------------------------------------
-- 7. DENGUE — Caso individual
-- Granularidad: 1 fila = 1 caso/persona (sin agregación)
-- edad es nullable (ausencia legítima en la fuente, no es rechazo)
-- diagnostic: código CIE-10 como texto (ej. A97.0)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS caso_dengue (
    id_caso_dengue BIGSERIAL PRIMARY KEY,
    ubigeo         CHAR(6)   NOT NULL REFERENCES distrito(ubigeo),
    id_periodo     INT       NOT NULL REFERENCES periodo_epidemiologico(id_periodo),
    id_diresa      INT       REFERENCES direccion_salud(id_diresa),
    enfermedad     VARCHAR(80) NOT NULL,
    diagnostic     VARCHAR(20),
    edad           SMALLINT  CHECK (edad >= 0),   -- nullable: ausencia legítima
    tipo_edad      CHAR(1)   NOT NULL CHECK (tipo_edad IN ('A', 'M', 'D')),
    sexo           CHAR(1)   NOT NULL CHECK (sexo IN ('M', 'F'))
);

CREATE INDEX IF NOT EXISTS idx_dengue_ubigeo_periodo
    ON caso_dengue (ubigeo, id_periodo);

CREATE INDEX IF NOT EXISTS idx_dengue_enfermedad
    ON caso_dengue (enfermedad);

-- ---------------------------------------------------------------------------
-- 8. CONTROL DE CARGA
-- Registra cada ejecución del script de carga para auditoría y modo HIST/SEMANAL
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS control_carga (
    id_carga         SERIAL      PRIMARY KEY,
    dataset          VARCHAR(20) NOT NULL CHECK (dataset IN ('EDA', 'IRA_NEUMONIA', 'IRA_NO_NEUMONIA', 'DENGUE')),
    modo             VARCHAR(20) NOT NULL CHECK (modo IN ('HISTORICO', 'SEMANAL')),
    anio             SMALLINT,
    semana           SMALLINT,
    fecha_ejecucion  TIMESTAMP   NOT NULL DEFAULT now(),
    filas_insertadas INT,
    filas_omitidas   INT,    -- duplicados ya existentes (ON CONFLICT DO NOTHING)
    estado           VARCHAR(20) NOT NULL CHECK (estado IN ('COMPLETADO', 'FALLIDO')),
    detalle_error    TEXT        -- NULL si estado = COMPLETADO
);
