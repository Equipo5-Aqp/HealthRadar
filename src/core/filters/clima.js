// @healthradar/core — filters/clima.js
// ─────────────────────────────────────────────────────────
// Filtra datos climáticos de v_clima_actual por el rango de periodo resuelto.
// Extraído del nodo "Filtrar clima del periodo" del workflow NLQ.

'use strict';

/**
 * Filtra datos climáticos por el rango de periodo resuelto.
 *
 * @param {object} periodo - Output de resolverVentana
 * @param {Array<{anio: number, semana_epidemiologica: number, ...}>} filas
 * @returns {Array} Filas climáticas filtradas
 */
function filtrarClima(periodo, filas) {
  const datos = filas || [];

  const anioEspecifico = periodo.anio;
  const hayPeriodoEspecifico = (anioEspecifico !== null && anioEspecifico !== undefined && anioEspecifico !== 'null');

  if (hayPeriodoEspecifico) {
    const anioNum = parseInt(anioEspecifico, 10);
    const semanaDesde = parseInt(periodo.semana_desde, 10);
    const semanaHasta = parseInt(periodo.semana_hasta, 10);

    return datos.filter(f => {
      const anioFila = parseInt(f.anio, 10);
      const semanaFila = parseInt(f.semana_epidemiologica, 10);
      return anioFila === anioNum && semanaFila >= semanaDesde && semanaFila <= semanaHasta;
    });
  }

  // Ventana por defecto: usar rango multi-año
  const anioDesde = parseInt(periodo.anio_desde, 10);
  const anioHasta = parseInt(periodo.anio_hasta, 10);
  const semanaDesde = parseInt(periodo.semana_desde, 10);
  const semanaHasta = parseInt(periodo.semana_hasta, 10);

  const claveDesde = anioDesde * 100 + semanaDesde;
  const claveHasta = anioHasta * 100 + semanaHasta;

  return datos.filter(f => {
    const anioFila = parseInt(f.anio, 10);
    const semanaFila = parseInt(f.semana_epidemiologica, 10);
    const claveFila = anioFila * 100 + semanaFila;
    return claveFila >= claveDesde && claveFila <= claveHasta;
  });
}

module.exports = { filtrarClima };
