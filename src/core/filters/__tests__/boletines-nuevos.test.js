'use strict';
const { filtrarNuevos } = require('../boletines-nuevos');

const b = (anio, semana, url = `u${anio}-${semana}`) => ({ url_boletin: url, anio, semana_epidemiologica: semana, fecha_publicacion: null });

describe('filtrarNuevos', () => {
  test('descarta los que ya existen por (año, semana) y marca los nuevos como pendientes', () => {
    const r = filtrarNuevos([b(2026, 1), b(2026, 2), b(2026, 3)], [{ anio: 2026, semana_epidemiologica: 1 }, { anio: 2026, semana_epidemiologica: 2 }]);
    expect(r).toEqual([{ ...b(2026, 3), resumen: '', procesado: false }]);
  });
  test('el mismo número de semana en otro año es distinto', () => {
    expect(filtrarNuevos([b(2026, 5)], [{ anio: 2025, semana_epidemiologica: 5 }])).toHaveLength(1);
  });
  test('no repite (año, semana) dentro del propio listado', () => {
    expect(filtrarNuevos([b(2026, 7, 'a'), b(2026, 7, 'b')], [])).toHaveLength(1);
  });
  test('todo existente → []', () => {
    expect(filtrarNuevos([b(2026, 1)], [{ anio: 2026, semana_epidemiologica: 1 }])).toEqual([]);
  });
  test('claves numéricas o texto coinciden (viene de Postgres)', () => {
    expect(filtrarNuevos([b(2026, 4)], [{ anio: '2026', semana_epidemiologica: '4' }])).toEqual([]);
  });
  test('entradas nulas o indefinidas', () => {
    expect(filtrarNuevos(undefined, undefined)).toEqual([]);
    expect(filtrarNuevos(null, null)).toEqual([]);
    expect(filtrarNuevos([b(2026, 1)], undefined)).toHaveLength(1);
  });
  test('no muta los objetos de entrada', () => {
    const c = b(2026, 9);
    filtrarNuevos([c], []);
    expect(c).toEqual(b(2026, 9));
  });
});
