// @healthradar/core — presentacion/riesgo.js
// ─────────────────────────────────────────────────────────
// Constantes de presentación del nivel de riesgo.
// Fuente única de verdad — el frontend mantiene una copia duplicada
// sincronizada por test de snapshot (Opción A, ADR-012).

'use strict';

const RIESGO_COLORES = {
  alto:  { bg: '#2A180F', text: '#FF6B4A', barra: '#FF6B4A' },
  medio: { bg: '#2A2410', text: '#FFD24A', barra: '#FFD24A' },
  bajo:  { bg: '#0F2A18', text: '#4AFF8F', barra: '#4AFF8F' },
};

const RIESGO_NIVEL_PCT = { bajo: 33, medio: 66, alto: 100 };

module.exports = { RIESGO_COLORES, RIESGO_NIVEL_PCT };
