-- ==============================================================================
-- MIGRACIÓN 005 — Coordenadas de centroides departamentales
-- Fecha     : 2026-09-13
-- Precondición: Migración 004 aplicada (columnas latitud/longitud ya existen en
--               la tabla departamento y los 25 registros ya están cargados).
-- Propósito : Poblar las columnas latitud y longitud con los centroides usados
--             por el workflow N8N de extracción climática (Open-Meteo).
--             Estos valores son la fuente de verdad para cruzar datos
--             epidemiológicos con datos climáticos en dato_climatico.
-- ==============================================================================

-- Los nombres en la BD pueden tener variantes (sin tildes, capitalización distinta).
-- Usamos ON CONFLICT (id_departamento) para actualizar solo latitud/longitud
-- sin alterar el nombre original cargado por el ETL del MINSA.

UPDATE departamento SET latitud = -6.23,  longitud = -77.87 WHERE id_departamento = '01'; -- Amazonas
UPDATE departamento SET latitud = -9.53,  longitud = -77.53 WHERE id_departamento = '02'; -- Áncash
UPDATE departamento SET latitud = -13.63, longitud = -72.88 WHERE id_departamento = '03'; -- Apurímac
UPDATE departamento SET latitud = -16.40, longitud = -71.54 WHERE id_departamento = '04'; -- Arequipa
UPDATE departamento SET latitud = -13.16, longitud = -74.22 WHERE id_departamento = '05'; -- Ayacucho
UPDATE departamento SET latitud = -7.16,  longitud = -78.51 WHERE id_departamento = '06'; -- Cajamarca
UPDATE departamento SET latitud = -12.05, longitud = -77.12 WHERE id_departamento = '07'; -- Callao
UPDATE departamento SET latitud = -13.53, longitud = -71.97 WHERE id_departamento = '08'; -- Cusco
UPDATE departamento SET latitud = -12.78, longitud = -74.97 WHERE id_departamento = '09'; -- Huancavelica
UPDATE departamento SET latitud = -9.93,  longitud = -76.24 WHERE id_departamento = '10'; -- Huánuco
UPDATE departamento SET latitud = -14.07, longitud = -75.73 WHERE id_departamento = '11'; -- Ica
UPDATE departamento SET latitud = -12.07, longitud = -75.21 WHERE id_departamento = '12'; -- Junín
UPDATE departamento SET latitud = -8.11,  longitud = -79.03 WHERE id_departamento = '13'; -- La Libertad
UPDATE departamento SET latitud = -6.77,  longitud = -79.84 WHERE id_departamento = '14'; -- Lambayeque
UPDATE departamento SET latitud = -12.05, longitud = -77.04 WHERE id_departamento = '15'; -- Lima
UPDATE departamento SET latitud = -3.75,  longitud = -73.25 WHERE id_departamento = '16'; -- Loreto
UPDATE departamento SET latitud = -12.60, longitud = -69.19 WHERE id_departamento = '17'; -- Madre de Dios
UPDATE departamento SET latitud = -17.19, longitud = -70.93 WHERE id_departamento = '18'; -- Moquegua
UPDATE departamento SET latitud = -10.68, longitud = -76.26 WHERE id_departamento = '19'; -- Pasco
UPDATE departamento SET latitud = -5.19,  longitud = -80.63 WHERE id_departamento = '20'; -- Piura
UPDATE departamento SET latitud = -15.84, longitud = -70.02 WHERE id_departamento = '21'; -- Puno
UPDATE departamento SET latitud = -6.49,  longitud = -76.37 WHERE id_departamento = '22'; -- San Martín
UPDATE departamento SET latitud = -18.01, longitud = -70.25 WHERE id_departamento = '23'; -- Tacna
UPDATE departamento SET latitud = -3.57,  longitud = -80.45 WHERE id_departamento = '24'; -- Tumbes
UPDATE departamento SET latitud = -8.38,  longitud = -74.55 WHERE id_departamento = '25'; -- Ucayali