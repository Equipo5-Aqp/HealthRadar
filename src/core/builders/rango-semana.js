// @healthradar/core — builders/rango-semana.js
// ─────────────────────────────────────────────────────────
// Fase B: fechas exactas (domingo–sábado) de la semana epidemiológica de un boletín,
// para pedir a Open-Meteo el clima de ESA semana.

'use strict';

const { semanasEnAnio, rangoDeSemana } = require('../utils/semana-epi');

/**
 * @param {number} anio    - Año epidemiológico (2000–2100)
 * @param {number} semana  - Semana 1..52/53 (53 solo si ese año la tiene)
 * @returns {{anio:number, semana_epidemiologica:number, fecha_inicio:string, fecha_fin:string}}
 */
function calcularRangoFechasSemana(anio, semana) {
  const a = Number(anio);
  const s = Number(semana);
  if (!Number.isInteger(a) || a < 2000 || a > 2100) {
    throw new Error(`Anio epidemiologico invalido: ${anio}`);
  }
  if (!Number.isInteger(s) || s < 1 || s > semanasEnAnio(a)) {
    throw new Error(`Semana epidemiologica invalida para ${a}: ${semana} (el anio tiene ${semanasEnAnio(a)})`);
  }
  const { inicio, fin } = rangoDeSemana(a, s);
  return { anio: a, semana_epidemiologica: s, fecha_inicio: inicio, fecha_fin: fin };
}

module.exports = { calcularRangoFechasSemana };
