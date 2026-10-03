// @healthradar/core — utils/semana-epi.js
// ─────────────────────────────────────────────────────────
// Aritmética de semanas epidemiológicas DGE/MINSA (domingo–sábado).
//   · SE 01 de un año = la semana domingo–sábado que contiene el 4 de enero.
//   · El año epidemiológico de una fecha = año calendario del MIÉRCOLES de su semana.
// Misma regla que fn_semana_epi_dge() (migración 007).
// Todo en UTC, sin Date locales: el resultado no depende de la zona horaria del servidor.

'use strict';

const MS_DIA = 86400000;
const MS_SEMANA = 7 * MS_DIA;

const dow = (ms) => new Date(ms).getUTCDay(); // 0 = domingo
const aISO = (ms) => new Date(ms).toISOString().slice(0, 10);

/** 'AAAA-MM-DD' (o ISO con hora) → ms UTC a medianoche. Lanza si no es una fecha real. */
function parsearFechaISO(fecha) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha));
  if (!m) throw new Error(`Fecha invalida: ${fecha}`);
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(anio, mes - 1, dia);
  const d = new Date(ms);
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    throw new Error(`Fecha invalida: ${fecha}`);
  }
  return ms;
}

/** Domingo (ms UTC) en que empieza la SE 01 del año epidemiológico dado. */
function domingoSE1(anio) {
  const ene4 = Date.UTC(anio, 0, 4);
  return ene4 - dow(ene4) * MS_DIA;
}

/** Cuántas semanas tiene el año epidemiológico (52 o 53). */
function semanasEnAnio(anio) {
  return Math.round((domingoSE1(anio + 1) - domingoSE1(anio)) / MS_SEMANA);
}

/** Año y semana epidemiológica DGE de una fecha 'AAAA-MM-DD'. */
function semanaEpiDGE(fecha) {
  const ms = parsearFechaISO(fecha);
  const domingo = ms - dow(ms) * MS_DIA;
  const anio = new Date(domingo + 3 * MS_DIA).getUTCFullYear();
  const semana = Math.round((domingo - domingoSE1(anio)) / MS_SEMANA) + 1;
  return { anio, semana };
}

/** Fechas (domingo y sábado, 'AAAA-MM-DD') de una semana epidemiológica. */
function rangoDeSemana(anio, semana) {
  const inicio = domingoSE1(anio) + (semana - 1) * MS_SEMANA;
  return { inicio: aISO(inicio), fin: aISO(inicio + 6 * MS_DIA) };
}

module.exports = { semanaEpiDGE, semanasEnAnio, rangoDeSemana, domingoSE1, parsearFechaISO };
