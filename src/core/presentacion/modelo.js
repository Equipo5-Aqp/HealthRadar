// @healthradar/core — presentacion/modelo.js
// ─────────────────────────────────────────────────────────
// Lógica de etiquetado de modelo LLM para el frontend.
// Extraído de page.js del frontend.

'use strict';

/**
 * Genera la etiqueta legible para el badge del modelo LLM usado.
 *
 * @param {string|null} modelo - Identificador del modelo (ej. 'claude', 'gemini-3.6-flash')
 * @returns {{ etiqueta: string, colorBg: string }|null}
 */
function etiquetaModelo(modelo) {
  if (!modelo) return null;

  if (modelo === 'claude') {
    return { etiqueta: 'Claude (respaldo)', colorBg: '#6B4AFF' };
  }

  if (modelo.startsWith('gemini')) {
    return { etiqueta: 'Gemini', colorBg: '#4A9EFF' };
  }

  return { etiqueta: modelo, colorBg: '#4A9EFF' };
}

module.exports = { etiquetaModelo };
