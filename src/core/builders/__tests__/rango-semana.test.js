'use strict';
const { calcularRangoFechasSemana } = require('../rango-semana');

describe('calcularRangoFechasSemana', () => {
  test('devuelve domingo y sábado de la semana', () => {
    expect(calcularRangoFechasSemana(2026, 27)).toEqual({
      anio: 2026, semana_epidemiologica: 27, fecha_inicio: '2026-07-05', fecha_fin: '2026-07-11',
    });
    expect(calcularRangoFechasSemana(2025, 8)).toEqual({
      anio: 2025, semana_epidemiologica: 8, fecha_inicio: '2025-02-16', fecha_fin: '2025-02-22',
    });
  });
  test('SE 01 puede empezar en diciembre del año anterior', () => {
    expect(calcularRangoFechasSemana(2024, 1)).toMatchObject({ fecha_inicio: '2023-12-31', fecha_fin: '2024-01-06' });
  });
  test('acepta texto numérico (viene de Postgres/n8n)', () => {
    expect(calcularRangoFechasSemana('2026', '27').fecha_inicio).toBe('2026-07-05');
  });
  test('semana 53 solo en años que la tienen', () => {
    expect(calcularRangoFechasSemana(2014, 53)).toMatchObject({ fecha_inicio: '2014-12-28', fecha_fin: '2015-01-03' });
    expect(() => calcularRangoFechasSemana(2021, 53)).toThrow('Semana epidemiologica invalida');
  });
  test.each([[2026, 0], [2026, 54], [2026, 1.5], [2026, 'x'], [2026, undefined]])('semana inválida %p/%p', (a, s) => {
    expect(() => calcularRangoFechasSemana(a, s)).toThrow('Semana epidemiologica invalida');
  });
  test.each([[1999, 5], [2101, 5], ['abc', 5], [undefined, 5]])('año inválido %p/%p', (a, s) => {
    expect(() => calcularRangoFechasSemana(a, s)).toThrow('Anio epidemiologico invalido');
  });
  test('siempre 7 días, domingo a sábado', () => {
    for (let s = 1; s <= 52; s++) {
      const { fecha_inicio: i, fecha_fin: f } = calcularRangoFechasSemana(2026, s);
      expect(new Date(i).getUTCDay()).toBe(0);
      expect(new Date(f).getUTCDay()).toBe(6);
      expect((Date.parse(f) - Date.parse(i)) / 86400000).toBe(6);
    }
  });
});
