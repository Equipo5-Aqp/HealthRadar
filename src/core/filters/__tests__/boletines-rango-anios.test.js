// Tests — filters/boletines.js: rango de años pedido por el analista ("2023 y 2024")
const { filtrarBoletines } = require('../boletines');

const b = (anio, semana) => ({ anio, semana_epidemiologica: semana, resumen: `Resumen SE ${semana}-${anio}` });
const BOLETINES = [b(2025, 1), b(2025, 2), b(2025, 29), b(2026, 1), b(2026, 2)];
const rango = (desde, hasta) => ({ anio: null, anio_desde: desde, anio_hasta: hasta, semana_desde: 1, semana_hasta: 53, rango_anios: true });

describe('filtrarBoletines — rango de años', () => {
  test('rango anterior a 2025: no hay boletines y NO se devuelven los de otros años', () => {
    expect(filtrarBoletines(rango(2023, 2024), BOLETINES)).toEqual([{ _sin_boletines: true }]);
  });

  test('rango que cruza 2024/2025: solo los boletines de 2025', () => {
    const r = filtrarBoletines(rango(2024, 2025), BOLETINES);
    expect(r.map(f => `${f.anio}-${f.semana_epidemiologica}`)).toEqual(['2025-1', '2025-2', '2025-29']);
  });

  test('rango 2025–2026: todos los de esos años', () => {
    expect(filtrarBoletines(rango(2025, 2026), BOLETINES)).toHaveLength(5);
  });

  test('rango ≥ 2025 sin boletines procesados: motivo sin_boletin_en_periodo', () => {
    expect(filtrarBoletines(rango(2027, 2028), BOLETINES)).toEqual([{ _sin_boletines: true, motivo: 'sin_boletin_en_periodo' }]);
    expect(filtrarBoletines(rango(2025, 2026), [])).toEqual([{ _sin_boletines: true, motivo: 'sin_boletin_en_periodo' }]);
  });

  test('la ventana por defecto sigue usando "todos los disponibles" cuando la ventana queda vacía', () => {
    const ventana = { anio: null, anio_desde: 2023, anio_hasta: 2023, semana_desde: 1, semana_hasta: 12 };
    expect(filtrarBoletines(ventana, BOLETINES)).toHaveLength(5);
  });
});
