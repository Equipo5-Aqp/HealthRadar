// @healthradar/core — builders/lista-anios.js
// ─────────────────────────────────────────────────────────
// Fase A (Recolección de links de boletines): años que hay que consultar al DGE.
// Antes era un array fijo en el nodo ([2025, 2026]); ahora crece solo con el año actual.

'use strict';

const ANIO_MIN = 2000;
const ANIO_MAX = 2100;

/**
 * @param {object} [opciones]
 * @param {number} [opciones.desde=2025] - Primer año a consultar
 * @param {number} [opciones.hasta]      - Último año (por defecto, el año de `ahora`)
 * @param {Date}   [opciones.ahora]      - Reloj inyectable (tests deterministas)
 * @returns {number[]} Años en orden ascendente, ej. [2025, 2026]
 */
function generarListaAnios({ desde = 2025, hasta, ahora = new Date() } = {}) {
  const fin = hasta === undefined ? ahora.getUTCFullYear() : hasta;
  const validos = Number.isInteger(desde) && Number.isInteger(fin)
    && desde >= ANIO_MIN && fin <= ANIO_MAX && desde <= fin;
  if (!validos) {
    throw new Error(`Rango de anios invalido: desde=${desde}, hasta=${fin}`);
  }
  return Array.from({ length: fin - desde + 1 }, (_, i) => desde + i);
}

module.exports = { generarListaAnios };
