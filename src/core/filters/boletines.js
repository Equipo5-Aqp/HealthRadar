// @healthradar/core — filters/boletines.js
// ─────────────────────────────────────────────────────────
// Filtra boletines de boletin_descubierto por el rango de periodo resuelto.
// Extraído del nodo "Filtrar boletines del periodo" del workflow NLQ.

'use strict';

/**
 * Verifica si un resumen es un texto real (no vacío/placeholder).
 */
function tieneResumenReal(resumen) {
  if (!resumen) return false;
  const texto = resumen.toString().trim().toLowerCase();
  if (texto.length === 0) return false;
  if (texto === 'empty' || texto === 'null' || texto === 'undefined') return false;
  return true;
}

/**
 * Filtra boletines por el rango de periodo resuelto.
 *
 * @param {object} periodo - Output de resolverVentana
 * @param {Array<{anio: number, semana_epidemiologica: number, resumen: string}>} boletines
 * @returns {Array} Boletines filtrados, o [{_sin_boletines: true}] si no hay resultados
 */
function filtrarBoletines(periodo, boletines) {
  const filasConResumen = (boletines || []).filter(f => tieneResumenReal(f.resumen));

  const anioEspecifico = periodo.anio;
  const hayPeriodoEspecifico = (anioEspecifico !== null && anioEspecifico !== undefined && anioEspecifico !== 'null');

  let filtradas = [];

  if (hayPeriodoEspecifico) {
    const anioNum = parseInt(anioEspecifico, 10);

    // Periodos anteriores a 2025: los boletines no cubren esos años.
    // No es error — se resuelve por Postgres (predicción).
    if (anioNum < 2025) {
      return [{ _sin_boletines: true }];
    }

    const semanaDesde = parseInt(periodo.semana_desde, 10);
    const semanaHasta = parseInt(periodo.semana_hasta, 10);

    filtradas = filasConResumen.filter(f => {
      const anioFila = parseInt(f.anio, 10);
      const semanaFila = parseInt(f.semana_epidemiologica, 10);
      return anioFila === anioNum && semanaFila >= semanaDesde && semanaFila <= semanaHasta;
    });

    if (filtradas.length === 0) {
      throw new Error(
        'No se encontraron boletines con resumen para el periodo solicitado: ' + periodo.criterio_usado
      );
    }
  } else {
    const anioDesde = parseInt(periodo.anio_desde, 10);
    const anioHasta = parseInt(periodo.anio_hasta, 10);
    const semanaDesde = parseInt(periodo.semana_desde, 10);
    const semanaHasta = parseInt(periodo.semana_hasta, 10);

    const claveDesde = anioDesde * 100 + semanaDesde;
    const claveHasta = anioHasta * 100 + semanaHasta;

    filtradas = filasConResumen.filter(f => {
      const anioFila = parseInt(f.anio, 10);
      const semanaFila = parseInt(f.semana_epidemiologica, 10);
      const claveFila = anioFila * 100 + semanaFila;
      return claveFila >= claveDesde && claveFila <= claveHasta;
    });

    // Si no hay boletines en la ventana, usar todos los disponibles
    if (filtradas.length === 0) {
      filtradas = filasConResumen;
    }
  }

  if (filtradas.length === 0) {
    return [{ _sin_boletines: true }];
  }

  return filtradas;
}

module.exports = { filtrarBoletines, tieneResumenReal };
