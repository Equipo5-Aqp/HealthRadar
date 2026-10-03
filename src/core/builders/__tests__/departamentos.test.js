'use strict';
const { generarDepartamentos, DEPARTAMENTOS_COORDENADAS } = require('../departamentos');
const { detectarDepartamento } = require('../../parsers/departamento');

describe('generarDepartamentos', () => {
  test('25 departamentos, códigos 01..25 sin repetir', () => {
    const r = generarDepartamentos();
    expect(r).toHaveLength(25);
    expect(r.map((d) => d.codigo)).toEqual(Array.from({ length: 25 }, (_, i) => String(i + 1).padStart(2, '0')));
  });
  test('Callao y Lima son puntos distintos con las coordenadas de la migración 005', () => {
    const r = generarDepartamentos();
    const callao = r.find((d) => d.departamento === 'Callao');
    const lima = r.find((d) => d.departamento === 'Lima');
    expect([callao.codigo, callao.latitud, callao.longitud]).toEqual(['07', -12.05, -77.12]);
    expect([lima.codigo, lima.latitud, lima.longitud]).toEqual(['15', -12.05, -77.04]);
  });
  test('cada departamento resuelve a su propio punto (nadie queda como otro por cercanía)', () => {
    for (const d of DEPARTAMENTOS_COORDENADAS) {
      const masCercano = DEPARTAMENTOS_COORDENADAS
        .map((o) => ({ o, dist: (o.latitud - d.latitud) ** 2 + (o.longitud - d.longitud) ** 2 }))
        .sort((a, b) => a.dist - b.dist)[0].o;
      expect(masCercano.codigo).toBe(d.codigo);
    }
  });
  test('los nombres/códigos coinciden con el parser de departamentos', () => {
    for (const d of DEPARTAMENTOS_COORDENADAS) {
      expect(detectarDepartamento(`casos en ${d.departamento}`).codigo_departamento).toBe(d.codigo);
    }
  });
  test('copia los datos de la semana a cada departamento', () => {
    const rango = { anio: 2026, semana_epidemiologica: 27, fecha_inicio: '2026-07-05', fecha_fin: '2026-07-11', otro: 'ignorado' };
    for (const d of generarDepartamentos(rango)) {
      expect(d).toMatchObject({ anio: 2026, semana_epidemiologica: 27, fecha_inicio: '2026-07-05', fecha_fin: '2026-07-11' });
      expect(d.otro).toBeUndefined();
    }
  });
  test('la tabla base es inmutable', () => {
    expect(Object.isFrozen(DEPARTAMENTOS_COORDENADAS)).toBe(true);
    generarDepartamentos()[0].latitud = 0;
    expect(DEPARTAMENTOS_COORDENADAS[0].latitud).toBe(-6.23);
  });
});
