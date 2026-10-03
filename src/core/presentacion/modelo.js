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

  if (/kimi/i.test(modelo)) {
    return { etiqueta: 'Kimi', colorBg: '#1F6FEB' };
  }

  if (modelo.startsWith('z-ai/glm')) {
    return { etiqueta: 'GLM', colorBg: '#76B900' };
  }

  if (modelo.startsWith('gemini')) {
    return { etiqueta: 'Gemini', colorBg: '#4A9EFF' };
  }

  return { etiqueta: modelo, colorBg: '#4A9EFF' };
}

// Cadena de failover del NLQ: 1 = Kimi K3 (NVIDIA, principal),
// 2 = GLM 5.3 (NVIDIA), 3 y 4 = Gemini.
const MODELOS_POR_AGENTE = Object.freeze({
  1: { modelo: 'moonshotai/kimi-k3', proveedor: 'nvidia' },
  2: { modelo: 'z-ai/glm-5.3', proveedor: 'nvidia' },
  3: { modelo: 'gemini-3.6-flash', proveedor: 'google' },
  4: { modelo: 'gemini-3.6-flash', proveedor: 'google' },
});

/**
 * Traduce el numero de agente que respondio a modelo/proveedor.
 * Un valor desconocido cae en el agente principal.
 *
 * @param {number} agente - 1 a 4
 * @returns {{ agente: number, modelo: string, proveedor: string }}
 */
function modeloPorAgente(agente) {
  const n = MODELOS_POR_AGENTE[agente] ? agente : 1;
  return { agente: n, ...MODELOS_POR_AGENTE[n] };
}

module.exports = { etiquetaModelo, modeloPorAgente, MODELOS_POR_AGENTE };
