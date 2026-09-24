// @healthradar/core — validators/resumen-boletin.js
// ─────────────────────────────────────────────────────────
// Valida el output del LLM para la extracción de boletines epidemiológicos.
// Extraído del nodo "Validar resumen (detiene si falla)" del workflow Fase B.

'use strict';

/**
 * Valida que el resumen generado por el LLM sea un texto válido y contenga
 * la línea de semana epidemiológica esperada.
 *
 * @param {string} output - Texto generado por el LLM
 * @param {string} modeloUsado - Identificador del modelo que generó el resumen
 * @param {number} semanaEsperada - Semana epidemiológica que debe aparecer en el resumen
 * @returns {{ resumen: string }} - Resumen validado y limpio
 * @throws {Error} Si el output es inválido o falta la línea de SE
 */
function validarResumenBoletin(output, modeloUsado, semanaEsperada) {
  if (!output || typeof output !== 'string' || output.trim().length === 0) {
    throw new Error(
      'El modelo no devolvio un resumen valido (fuente: ' + modeloUsado + ')'
    );
  }

  // Validación: el resumen debe incluir la línea de semana epidemiológica
  const semanaMatch = output.match(/SEMANA EPIDEMIOL[OÓ]GICA:\s*(\d{1,2})/i);
  if (!semanaMatch) {
    throw new Error(
      'El resumen del modelo no incluye la linea SEMANA EPIDEMIOLOGICA esperada (fuente: ' +
      modeloUsado + ')'
    );
  }

  return {
    resumen: output.trim(),
  };
}

module.exports = { validarResumenBoletin };
