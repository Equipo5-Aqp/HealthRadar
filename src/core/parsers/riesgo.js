// @healthradar/core — parsers/riesgo.js
// ─────────────────────────────────────────────────────────
// Extrae el marcador [NIVEL_RIESGO: alto|medio|bajo] que el AI Agent escribe
// al final de su respuesta, lo separa a un campo estructurado, y limpia
// esa línea del texto que ve el analista.
//
// Extraído del nodo "Extraer y limpiar nivel de riesgo" del workflow NLQ.

'use strict';

const REGEX_MARCADOR = /\[NIVEL_RIESGO:\s*(alto|medio|bajo)\]/i;

/**
 * Extrae nivel de riesgo del output del AI Agent y limpia el texto.
 *
 * @param {object} salidaAgente - Output del AI Agent (con campo .output)
 * @returns {object} - salidaAgente con output limpio + campo nivel_riesgo añadido
 */
function extraerNivelRiesgo(salidaAgente) {
  const textoOriginal = (salidaAgente && salidaAgente.output) || '';
  const match = textoOriginal.match(REGEX_MARCADOR);

  const nivelRiesgo = match ? match[1].toLowerCase() : null;
  const textoLimpio = textoOriginal.replace(REGEX_MARCADOR, '').trimEnd();

  return {
    ...salidaAgente,
    output: textoLimpio,
    nivel_riesgo: nivelRiesgo,
  };
}

module.exports = { extraerNivelRiesgo, REGEX_MARCADOR };
