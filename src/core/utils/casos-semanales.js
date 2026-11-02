// @healthradar/core — utils/casos-semanales.js
// ─────────────────────────────────────────────────────────
// Los boletines traen cifras ACUMULADAS del año. Los casos de una semana son la diferencia entre
// dos boletines consecutivos. Puro: sin n8n, sin PostgreSQL, sin red.

'use strict';

const esNumeroValido = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const aNumero = v => (v === null || v === undefined || v === '' ? NaN : Number(v));
// Año y semana epidemiológica: enteros en rango; null/''/texto → NaN (Number(null) sería 0).
const aAnio = v => { const n = aNumero(v); return Number.isInteger(n) && n >= 1990 && n <= 2100 ? n : NaN; };
const aSemana = v => { const n = aNumero(v); return Number.isInteger(n) && n >= 1 && n <= 53 ? n : NaN; };

/**
 * Casos de cada semana a partir de cifras acumuladas del año.
 * semana N = acumulado(N) − acumulado(N−1). Si falta el boletín anterior, o el acumulado bajó
 * (corrección del boletín), esa semana NO se calcula: casos = null (nunca se inventa un cero).
 *
 * @param {Array<{anio:number, semana:number, acumulado:number|null}>} filas
 * @returns {Array<{anio:number, semana:number, casos:number|null}>} ordenadas por año y semana
 */
function casosSemanalesDesdeAcumulados(filas) {
  const porClave = new Map();
  for (const f of Array.isArray(filas) ? filas : []) {
    const anio = aAnio(f && f.anio);
    const semana = aSemana(f && f.semana);
    if (Number.isNaN(anio) || Number.isNaN(semana)) continue;
    porClave.set(`${anio}-${semana}`, { anio, semana, acumulado: aNumero(f.acumulado) });
  }
  const ordenadas = [...porClave.values()].sort((a, b) => (a.anio - b.anio) || (a.semana - b.semana));

  return ordenadas.map(f => {
    let casos = null;
    if (esNumeroValido(f.acumulado)) {
      if (f.semana === 1) {
        casos = f.acumulado; // el acumulado del año se reinicia en la semana 1
      } else {
        const previa = porClave.get(`${f.anio}-${f.semana - 1}`);
        if (previa && esNumeroValido(previa.acumulado) && f.acumulado >= previa.acumulado) {
          casos = f.acumulado - previa.acumulado;
        }
      }
    }
    return { anio: f.anio, semana: f.semana, casos };
  });
}

module.exports = { casosSemanalesDesdeAcumulados };
