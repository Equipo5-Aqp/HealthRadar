'use strict';

const { casosSemanalesDesdeAcumulados } = require('../casos-semanales');

describe('casosSemanalesDesdeAcumulados', () => {
  test('resta acumulados consecutivos', () => {
    const r = casosSemanalesDesdeAcumulados([
      { anio: 2025, semana: 10, acumulado: 1000 },
      { anio: 2025, semana: 11, acumulado: 1150 },
      { anio: 2025, semana: 12, acumulado: 1400 },
    ]);
    expect(r.map(x => x.casos)).toEqual([null, 150, 250]); // la 10 no tiene boletín previo
  });

  test('la semana 1 usa el acumulado tal cual (se reinicia cada año)', () => {
    const r = casosSemanalesDesdeAcumulados([{ anio: 2026, semana: 1, acumulado: 320 }]);
    expect(r).toEqual([{ anio: 2026, semana: 1, casos: 320 }]);
  });

  test('un hueco de semanas no se rellena', () => {
    const r = casosSemanalesDesdeAcumulados([
      { anio: 2025, semana: 10, acumulado: 1000 },
      { anio: 2025, semana: 12, acumulado: 1400 },
    ]);
    expect(r.map(x => x.casos)).toEqual([null, null]);
  });

  test('un acumulado que baja (corrección del boletín) no produce casos negativos', () => {
    const r = casosSemanalesDesdeAcumulados([
      { anio: 2025, semana: 10, acumulado: 1000 },
      { anio: 2025, semana: 11, acumulado: 990 },
      { anio: 2025, semana: 12, acumulado: 1100 },
    ]);
    expect(r.map(x => x.casos)).toEqual([null, null, 110]);
  });

  test('un acumulado igual al anterior es un cero real', () => {
    const r = casosSemanalesDesdeAcumulados([
      { anio: 2025, semana: 10, acumulado: 1000 },
      { anio: 2025, semana: 11, acumulado: 1000 },
    ]);
    expect(r[1].casos).toBe(0);
  });

  test('acumulado ausente o inválido → sin dato, y la semana siguiente tampoco se calcula', () => {
    const r = casosSemanalesDesdeAcumulados([
      { anio: 2025, semana: 10, acumulado: null },
      { anio: 2025, semana: 11, acumulado: 500 },
      { anio: 2025, semana: 12, acumulado: 'abc' },
      { anio: 2025, semana: 13, acumulado: 700 },
    ]);
    expect(r.map(x => x.casos)).toEqual([null, null, null, null]);
  });

  test('ordena por año y semana, ignora basura y deja el último de una clave repetida', () => {
    const r = casosSemanalesDesdeAcumulados([
      { anio: 2026, semana: 2, acumulado: 700 },
      null,
      { anio: 'x', semana: 1, acumulado: 5 },
      { anio: 2025, semana: 52, acumulado: 9000 },
      { anio: 2026, semana: 1, acumulado: 300 },
      { anio: 2026, semana: 1, acumulado: 350 },
    ]);
    expect(r).toEqual([
      { anio: 2025, semana: 52, casos: null },
      { anio: 2026, semana: 1, casos: 350 },
      { anio: 2026, semana: 2, casos: 350 },
    ]);
  });

  test('entrada que no es arreglo → vacío', () => {
    expect(casosSemanalesDesdeAcumulados(undefined)).toEqual([]);
    expect(casosSemanalesDesdeAcumulados('x')).toEqual([]);
  });
});
