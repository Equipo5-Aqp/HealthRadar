// @healthradar/core — parsers/riesgo.js
// ─────────────────────────────────────────────────────────
// Extrae el marcador [NIVEL_RIESGO: alto|medio|bajo] que el AI Agent escribe
// al final de su respuesta, lo separa a un campo estructurado, y limpia
// esa línea del texto que ve el analista.
//
// Tolera las variantes que el modelo escribe mal: [NIVEL_RISK: medio], [NIVEL DE RIESGO: Alto],
// [NIVEL-RIESGO = bajo] y el marcador sin el corchete de cierre. Antes esas variantes no se
// reconocían: el marcador quedaba visible en el texto y la respuesta salía sin nivel de riesgo.
//
// Extraído del nodo "Extraer y limpiar nivel de riesgo" del workflow NLQ.

'use strict';

const REGEX_MARCADOR = /\[\s*NIVEL[\s_-]*(?:DE[\s_-]*)?RI(?:ESGO|SK)\s*[:=]\s*(alto|medio|bajo)\b\s*\]?/i;

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
