// Sincronizado con @healthradar/core/presentacion/riesgo.js (1:1, verificado).
// Referencia: ADR-012 → Contratos entre capas
// PROHIBIDO: importar desde fuera de este MF (Regla 1 de gobernanza)
export const RIESGO_COLORES = {
  alto:  { bg: '#2A180F', text: '#FF6B4A', barra: '#FF6B4A' },
  medio: { bg: '#2A2410', text: '#FFD24A', barra: '#FFD24A' },
  bajo:  { bg: '#0F2A18', text: '#4AFF8F', barra: '#4AFF8F' },
}
export const RIESGO_NIVEL_PCT = { bajo: 33, medio: 66, alto: 100 }
