// @healthradar/core — parsers/cifras-boletin.js
// ─────────────────────────────────────────────────────────
// Lee y limpia el marcador legible por máquina que Fase B pide al final del
// resumen de cada boletín:
//
//   [CIFRAS: dengue_total=18663; dengue_sin_alarma=15853; eda_total=250047]
//
// Solo cifras ACUMULADAS del año del boletín, enteros sin separadores.
// Puro: sin n8n, sin PostgreSQL, sin red.

'use strict';

const RE_LINEA_MARCADOR = /^[ \t]*\[CIFRAS:([^\]\n]*)\][ \t]*$/gim;
const RE_CLAVE = /^[a-z][a-z0-9_]*$/;
const RE_VALOR = /^\d+$/;

/**
 * Extrae las cifras del último marcador [CIFRAS: ...] del texto.
 *
 * @param {string} texto
 * @returns {{ cifras: Object<string, number>, invalidas: string[] } | null}
 *          null si el texto no trae marcador. `invalidas` lista los pares mal formados
 *          (clave inválida, valor no entero, sin '='), que no entran en `cifras`.
 */
function extraerCifras(texto) {
  if (typeof texto !== 'string') return null;
  const coincidencias = [...texto.matchAll(RE_LINEA_MARCADOR)];
  if (coincidencias.length === 0) return null;

  const cuerpo = coincidencias[coincidencias.length - 1][1];
  const cifras = {};
  const invalidas = [];

  for (const crudo of cuerpo.split(';')) {
    const par = crudo.trim();
    if (par === '') continue;
    const i = par.indexOf('=');
    const clave = i === -1 ? '' : par.slice(0, i).trim();
    const valor = i === -1 ? '' : par.slice(i + 1).trim();
    if (!RE_CLAVE.test(clave) || !RE_VALOR.test(valor)) {
      invalidas.push(par);
      continue;
    }
    cifras[clave] = Number(valor);
  }
  return { cifras, invalidas };
}

/**
 * Quita el marcador [CIFRAS: ...] del texto (para mostrarlo o inyectarlo en un prompt).
 * Un texto que no es string se devuelve tal cual.
 *
 * @param {string} texto
 * @returns {string}
 */
function quitarMarcadorCifras(texto) {
  if (typeof texto !== 'string') return texto;
  return texto.replace(RE_LINEA_MARCADOR, '').replace(/\s+$/, '');
}

module.exports = { extraerCifras, quitarMarcadorCifras };
