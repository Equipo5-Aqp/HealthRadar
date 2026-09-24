// Tests — filters/clima.js
const { filtrarClima } = require('../clima');

describe('filtrarClima', () => {
  const datos = [
    { anio: 2026, semana_epidemiologica: 18, departamento: 'Lima', temp_max_promedio: 28.5 },
    { anio: 2026, semana_epidemiologica: 19, departamento: 'Lima', temp_max_promedio: 27.3 },
    { anio: 2026, semana_epidemiologica: 20, departamento: 'Lima', temp_max_promedio: 26.1 },
    { anio: 2025, semana_epidemiologica: 50, departamento: 'Lima', temp_max_promedio: 30.0 },
  ];

  test('filtra por periodo específico', () => {
    const periodo = { anio: 2026, semana_desde: 18, semana_hasta: 19 };
    const r = filtrarClima(periodo, datos);
    expect(r).toHaveLength(2);
  });

  test('filtra por ventana multi-año', () => {
    const periodo = { anio: null, semana_desde: 50, semana_hasta: 20, anio_desde: 2025, anio_hasta: 2026 };
    const r = filtrarClima(periodo, datos);
    expect(r.length).toBeGreaterThan(0);
  });

  test('retorna array vacío si no hay coincidencias', () => {
    const periodo = { anio: 2020, semana_desde: 1, semana_hasta: 53 };
    const r = filtrarClima(periodo, datos);
    expect(r).toHaveLength(0);
  });

  test('maneja datos vacíos', () => {
    const periodo = { anio: 2026, semana_desde: 1, semana_hasta: 53 };
    const r = filtrarClima(periodo, []);
    expect(r).toHaveLength(0);
  });
});
