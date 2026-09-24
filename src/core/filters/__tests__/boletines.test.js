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

  test('lanza error si no hay boletines para periodo explícito ≥2025', () => {
    const periodo = { anio: 2025, semana_desde: 1, semana_hasta: 5, criterio_usado: 'test' };
    expect(() => filtrarBoletines(periodo, boletines)).toThrow('No se encontraron boletines');
  });

  test('filtra por ventana multi-año', () => {
    const periodo = { anio: null, semana_desde: 50, semana_hasta: 20, anio_desde: 2025, anio_hasta: 2026 };
    const r = filtrarBoletines(periodo, boletines);
    expect(r.length).toBeGreaterThan(0);
  });
});
