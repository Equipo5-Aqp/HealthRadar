// Tests — filters/boletines.js
const { filtrarBoletines } = require('../boletines');

describe('filtrarBoletines', () => {
  const boletines = [
    { anio: 2026, semana_epidemiologica: 18, resumen: 'Resumen SE 18' },
    { anio: 2026, semana_epidemiologica: 19, resumen: 'Resumen SE 19' },
    { anio: 2026, semana_epidemiologica: 20, resumen: 'Resumen SE 20' },
    { anio: 2026, semana_epidemiologica: 21, resumen: '' },
    { anio: 2025, semana_epidemiologica: 50, resumen: 'Resumen SE 50' },
  ];

  test('filtra por periodo específico', () => {
    const periodo = { anio: 2026, semana_desde: 18, semana_hasta: 19, criterio_usado: 'test' };
    const r = filtrarBoletines(periodo, boletines);
    expect(r).toHaveLength(2);
    expect(r[0].semana_epidemiologica).toBe(18);
  });

  test('excluye boletines sin resumen real', () => {
    const periodo = { anio: 2026, semana_desde: 18, semana_hasta: 21, criterio_usado: 'test' };
    const r = filtrarBoletines(periodo, boletines);
    expect(r).toHaveLength(3); // SE 21 tiene resumen vacío
  });

  test('retorna _sin_boletines para años <2025', () => {
    const periodo = { anio: 2023, semana_desde: 1, semana_hasta: 53, criterio_usado: 'test' };
    const r = filtrarBoletines(periodo, boletines);
    expect(r).toEqual([{ _sin_boletines: true }]);
  });

  test('periodo explícito ≥2025 sin boletines: NO lanza error, devuelve _sin_boletines con motivo', () => {
    const periodo = { anio: 2025, semana_desde: 1, semana_hasta: 5, criterio_usado: 'test' };
    expect(filtrarBoletines(periodo, boletines)).toEqual([{ _sin_boletines: true, motivo: 'sin_boletin_en_periodo' }]);
  });

  test('periodo explícito ≥2025 con boletines pero fuera del rango: tampoco lanza', () => {
    const periodo = { anio: 2026, semana_desde: 40, semana_hasta: 45, criterio_usado: 'test' };
    expect(() => filtrarBoletines(periodo, boletines)).not.toThrow();
    expect(filtrarBoletines(periodo, boletines)[0]._sin_boletines).toBe(true);
  });

  test('sin ninguna fila de boletines y periodo ≥2025: _sin_boletines', () => {
    const periodo = { anio: 2026, semana_desde: 5, semana_hasta: 5, criterio_usado: 'test' };
    expect(filtrarBoletines(periodo, [])[0]._sin_boletines).toBe(true);
    expect(filtrarBoletines(periodo, undefined)[0]._sin_boletines).toBe(true);
  });

  test('filtra por ventana multi-año', () => {
    const periodo = { anio: null, semana_desde: 50, semana_hasta: 20, anio_desde: 2025, anio_hasta: 2026 };
    const r = filtrarBoletines(periodo, boletines);
    expect(r.length).toBeGreaterThan(0);
  });
});
