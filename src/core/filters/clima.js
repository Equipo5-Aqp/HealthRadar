// @healthradar/core — filters/clima.js
// ─────────────────────────────────────────────────────────
// Filtra datos climáticos de v_clima_actual por el rango de periodo resuelto y, si la pregunta
// nombra un departamento, también por departamento.
// Extraído del nodo "Filtrar clima del periodo" del workflow NLQ.

'use strict';

const { DEPARTAMENTOS } = require('../parsers/departamento');

/** Código de departamento como lo guarda la BD: texto de 2 dígitos ('01'..'25'). */
const codigoDepartamento = (v) => String(v === null || v === undefined ? '' : v).trim().padStart(2, '0');

/** Nombre sin tildes ni mayúsculas ('San Martín' → 'san martin'), igual que DEPARTAMENTOS. */
const normalizarNombre = (v) => String(v === null || v === undefined ? '' : v)
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const NOMBRE_POR_CODIGO = Object.fromEntries(Object.entries(DEPARTAMENTOS).map(([nombre, codigo]) => [codigo, nombre]));

const tieneValor = (v) => v !== null && v !== undefined && v !== '';

/**
 * Filtra datos climáticos por el rango de periodo resuelto y, opcionalmente, por departamento.
 *
 * @param {object} periodo - Output de resolverVentana
 * @param {Array<{anio: number, semana_epidemiologica: number, id_departamento?: string, departamento?: string, ...}>} filas
 * @param {string|string[]|null} [codigosDepartamento] - Código INEI ('15') o lista (['20','22']).
 *   Sin valor o vacío = los 25 departamentos, como siempre.
 * @returns {Array} Filas climáticas filtradas
 */
function filtrarClima(periodo, filas, codigosDepartamento) {
  const porPeriodo = filtrarPorPeriodo(periodo, filas);

  const lista = Array.isArray(codigosDepartamento) ? codigosDepartamento : [codigosDepartamento];
  const codigos = new Set(lista.filter(tieneValor).map(codigoDepartamento));
  if (codigos.size === 0) return porPeriodo;
  const nombres = new Set([...codigos].map(c => NOMBRE_POR_CODIGO[c]).filter(Boolean));

  // Se compara por id_departamento. Si la fila no trae esa columna (p. ej. un SELECT que solo pide el
  // nombre), se compara por nombre: así nunca se descartan todas las filas en silencio.
  return porPeriodo.filter(f => (tieneValor(f.id_departamento)
    ? codigos.has(codigoDepartamento(f.id_departamento))
    : nombres.has(normalizarNombre(f.departamento))));
}

/** Filtro por rango de periodo (año/semana). */
function filtrarPorPeriodo(periodo, filas) {
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
