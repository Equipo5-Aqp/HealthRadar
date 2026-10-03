// @healthradar/core — validators/filtros-consulta.js
// ─────────────────────────────────────────────────────────
// Valida y normaliza el body de los webhooks /historicos y /tendencia
// ANTES de que llegue a cualquier query SQL (corrección de HU-07: inyección SQL).
// Regla: el body es entrada NO confiable; solo se aceptan valores de una lista
// cerrada (tabla, departamento) o enteros acotados (anio, pagina).

'use strict';

const { DEPARTAMENTOS } = require('../parsers/departamento');

const TABLAS_VALIDAS = ['dengue', 'eda', 'ira_neumonia', 'ira_no_neumonia'];
const CODIGOS_DEPARTAMENTO = Object.values(DEPARTAMENTOS); // '01'..'25'
const ANIO_MIN = 2010; // migración 003: año mínimo en periodo_epidemiologico
const ANIO_MAX = 2100;
const PAGINA_MAX = 100000;

const vacio = (v) => v === undefined || v === null || v === '';

// Acepta un entero como number o como string de solo dígitos; si no, devuelve null.
function aEntero(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v === 'string' && /^\d{1,9}$/.test(v.trim())) return Number(v.trim());
  return null;
}

function invalido(error) {
  return { valido: false, error, filtros: null };
}

/**
 * @param {*} body - body del webhook (entrada no confiable)
 * @returns {{ valido: boolean, error: string|null,
 *             filtros: { tabla: string, departamento: string, anio: number, pagina: number }|null }}
 *   departamento: '' = sin filtro. anio: 0 = sin filtro. pagina: >= 1.
 */
function validarFiltrosConsulta(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return invalido('Cuerpo de la solicitud invalido');
  }

  if (!TABLAS_VALIDAS.includes(body.tabla)) {
    return invalido('Parametro "tabla" invalido');
  }

  let departamento = '';
  if (!vacio(body.departamento)) {
    if (typeof body.departamento !== 'string' ||
        !CODIGOS_DEPARTAMENTO.includes(body.departamento)) {
      return invalido('Parametro "departamento" invalido');
    }
    departamento = body.departamento;
  }

  let anio = 0;
  if (!vacio(body.anio)) {
    const n = aEntero(body.anio);
    if (n === null || n < ANIO_MIN || n > ANIO_MAX) {
      return invalido('Parametro "anio" invalido');
    }
    anio = n;
  }

  let pagina = 1;
  if (!vacio(body.pagina)) {
    const n = aEntero(body.pagina);
    if (n === null || n < 1 || n > PAGINA_MAX) {
      return invalido('Parametro "pagina" invalido');
    }
    pagina = n;
  }

  return { valido: true, error: null, filtros: { tabla: body.tabla, departamento, anio, pagina } };
}

module.exports = { validarFiltrosConsulta, TABLAS_VALIDAS };
