// Tests — presentacion/snapshot sync
// Opción A (ADR-012): Las constantes de presentación están duplicadas en
// el frontend (page.js) y en @healthradar/core. Este test garantiza que
// ambas copias estén sincronizadas.
const { RIESGO_COLORES, RIESGO_NIVEL_PCT } = require('../riesgo');

describe('Constantes de presentación (snapshot sync)', () => {
  test('RIESGO_COLORES snapshot', () => {
    expect(RIESGO_COLORES).toMatchInlineSnapshot(`
{
  "alto": {
    "barra": "#FF6B4A",
    "bg": "#2A180F",
    "text": "#FF6B4A",
  },
  "bajo": {
    "barra": "#4AFF8F",
    "bg": "#0F2A18",
    "text": "#4AFF8F",
  },
  "medio": {
    "barra": "#FFD24A",
    "bg": "#2A2410",
    "text": "#FFD24A",
  },
}
`);
  });

  test('RIESGO_NIVEL_PCT snapshot', () => {
    expect(RIESGO_NIVEL_PCT).toMatchInlineSnapshot(`
{
  "alto": 100,
  "bajo": 33,
  "medio": 66,
}
`);
  });
});
