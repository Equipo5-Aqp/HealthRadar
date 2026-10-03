'use strict';
const { semanaEpiDGE, semanasEnAnio, rangoDeSemana, domingoSE1, parsearFechaISO } = require('../semana-epi');
const { _internal } = require('../../parsers/periodo');

describe('semana-epi (regla DGE domingo–sábado)', () => {
  test('anclas conocidas', () => {
    expect(semanaEpiDGE('2023-12-31')).toEqual({ anio: 2024, semana: 1 }); // SE 01-2024 empieza el 31-Dic-2023
    expect(semanaEpiDGE('2024-01-06')).toEqual({ anio: 2024, semana: 1 });
    expect(semanaEpiDGE('2026-07-05')).toEqual({ anio: 2026, semana: 27 }); // ancla reportada por Full-Stack
    expect(semanaEpiDGE('2026-07-11')).toEqual({ anio: 2026, semana: 27 });
    expect(semanaEpiDGE('2009-11-02')).toEqual({ anio: 2009, semana: 44 }); // caso donde ISO daba 45
  });

  test('cruce de año: el año lo decide el miércoles', () => {
    expect(semanaEpiDGE('2014-12-28')).toEqual({ anio: 2014, semana: 53 });
    expect(semanaEpiDGE('2015-01-03')).toEqual({ anio: 2014, semana: 53 });
    expect(semanaEpiDGE('2015-01-04')).toEqual({ anio: 2015, semana: 1 });
  });

  test('coincide con la implementación existente del parser de periodo en todos los días 2009–2027', () => {
    for (let t = Date.UTC(2009, 0, 1); t <= Date.UTC(2027, 11, 31); t += 86400000) {
      const f = new Date(t).toISOString().slice(0, 10);
      expect(semanaEpiDGE(f)).toEqual(_internal.getSemanaEpi(f));
    }
  });

  test('semanasEnAnio: años de 53 semanas', () => {
    expect(semanasEnAnio(2014)).toBe(53);
    expect(semanasEnAnio(2020)).toBe(53);
    expect(semanasEnAnio(2021)).toBe(52);
    expect(semanasEnAnio(2024)).toBe(52);
  });

  test('rangoDeSemana: domingo a sábado', () => {
    expect(rangoDeSemana(2024, 1)).toEqual({ inicio: '2023-12-31', fin: '2024-01-06' });
    expect(rangoDeSemana(2026, 27)).toEqual({ inicio: '2026-07-05', fin: '2026-07-11' });
    expect(rangoDeSemana(2014, 53)).toEqual({ inicio: '2014-12-28', fin: '2015-01-03' });
  });

  test('rangoDeSemana es inverso de semanaEpiDGE', () => {
    for (const [a, s] of [[2010, 1], [2014, 53], [2020, 53], [2025, 8], [2026, 30]]) {
      const { inicio, fin } = rangoDeSemana(a, s);
      expect(semanaEpiDGE(inicio)).toEqual({ anio: a, semana: s });
      expect(semanaEpiDGE(fin)).toEqual({ anio: a, semana: s });
    }
  });

  test('domingoSE1 es domingo y parsearFechaISO valida', () => {
    expect(new Date(domingoSE1(2026)).getUTCDay()).toBe(0);
    expect(parsearFechaISO('2024-02-29')).toBe(Date.UTC(2024, 1, 29));
    expect(parsearFechaISO('2024-02-29T10:00:00Z')).toBe(Date.UTC(2024, 1, 29));
    expect(() => parsearFechaISO('2023-02-29')).toThrow('Fecha invalida');
    expect(() => parsearFechaISO('2023-13-01')).toThrow('Fecha invalida');
    expect(() => parsearFechaISO('hola')).toThrow('Fecha invalida');
    expect(() => parsearFechaISO(undefined)).toThrow('Fecha invalida');
  });
});
