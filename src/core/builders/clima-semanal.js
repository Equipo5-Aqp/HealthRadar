// @healthradar/core — builders/clima-semanal.js
// ─────────────────────────────────────────────────────────
// Fase B: agrupa el clima DIARIO de Open-Meteo en semanas epidemiológicas DGE.
// Regla de agregación (la misma de la carga histórica): promedio de temperaturas y
// humedad, SUMA de precipitación, 1 decimal. Si no hay ningún dato válido → null
// (nunca NaN ni 0, que se guardarían como dato falso en dato_climatico).

'use strict';

const { semanaEpiDGE } = require('../utils/semana-epi');

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const redondear = (v) => Number(v.toFixed(1));
const promedio = (a) => (a.length ? redondear(a.reduce((s, v) => s + v, 0) / a.length) : null);
const suma = (a) => (a.length ? redondear(a.reduce((s, v) => s + v, 0)) : null);

/**
 * @param {object} daily - Bloque `daily` de Open-Meteo: { time[], temperature_2m_max[], ... }
 * @param {object} [opciones]
 * @param {boolean} [opciones.soloCompletas=true] - Descarta semanas con menos de 7 días (bordes)
 * @param {number} [opciones.anioMin] - Descarta años epidemiológicos menores
 * @param {number} [opciones.anioMax] - Descarta años epidemiológicos mayores
 * @returns {object[]} Semanas ordenadas: { anio, semana, dias, temp_max_promedio, temp_min_promedio,
 *   temp_mean_promedio, precipitacion_total, humedad_promedio }
 */
function agruparPorSemanaEpi(daily, opciones = {}) {
  const { soloCompletas = true, anioMin = -Infinity, anioMax = Infinity } = opciones;
  if (!daily || !Array.isArray(daily.time)) {
    throw new Error('Open-Meteo no devolvio datos diarios (falta daily.time)');
  }

  const grupos = new Map();
  daily.time.forEach((fecha, i) => {
    const { anio, semana } = semanaEpiDGE(fecha);
    if (anio < anioMin || anio > anioMax) return;

    const k = anio * 100 + semana;
    if (!grupos.has(k)) {
      grupos.set(k, { anio, semana, dias: 0, tmax: [], tmin: [], tmean: [], prec: [], hum: [] });
    }
    const g = grupos.get(k);
    g.dias += 1;
    const agregar = (arr, serie) => { const v = serie && serie[i]; if (esNumero(v)) arr.push(v); };
    agregar(g.tmax, daily.temperature_2m_max);
    agregar(g.tmin, daily.temperature_2m_min);
    agregar(g.tmean, daily.temperature_2m_mean);
    agregar(g.prec, daily.precipitation_sum);
    agregar(g.hum, daily.relative_humidity_2m_mean);
  });

  return [...grupos.values()]
    .filter((g) => !soloCompletas || g.dias === 7)
    .sort((a, b) => a.anio - b.anio || a.semana - b.semana)
    .map((g) => ({
      anio: g.anio,
      semana: g.semana,
      dias: g.dias,
      temp_max_promedio: promedio(g.tmax),
      temp_min_promedio: promedio(g.tmin),
      temp_mean_promedio: promedio(g.tmean),
      precipitacion_total: suma(g.prec),
      humedad_promedio: promedio(g.hum),
    }));
}

module.exports = { agruparPorSemanaEpi };
