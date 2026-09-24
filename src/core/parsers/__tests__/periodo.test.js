// Tests — parsers/periodo.js
const { detectarPeriodo, resolverVentana, _internal } = require('../periodo');

describe('detectarPeriodo', () => {
  test('detecta rango entre meses', () => {
    const r = detectarPeriodo('entre marzo y mayo de 2025');
    expect(r.anio).toBe(2025);
    expect(r.semana_desde).toBeLessThanOrEqual(r.semana_hasta);
    expect(r.criterio_usado).toContain('rango');
  });

  test('detecta semana explícita', () => {
    const r = detectarPeriodo('semana 15');
    expect(r.semana_desde).toBe(15);
    expect(r.semana_hasta).toBe(15);
    expect(r.criterio_usado).toContain('semana especifica');
  });

  test('detecta SE con año', () => {
    const r = detectarPeriodo('SE 27 2026');
    expect(r.anio).toBe(2026);
    expect(r.semana_desde).toBe(27);
    expect(r.semana_hasta).toBe(27);
  });

  test('detecta mes específico', () => {
    const r = detectarPeriodo('mayo 2025');
    expect(r.anio).toBe(2025);
    expect(r.criterio_usado).toContain('mes especifico');
  });

  test('detecta "setiembre" como septiembre', () => {
    expect(_internal.MESES['setiembre']).toBe(9);
    const r = detectarPeriodo('setiembre 2025');
    expect(r.anio).toBe(2025);
  });

  test('detecta año completo con conector', () => {
    const r = detectarPeriodo('en 2023');
    expect(r.anio).toBe(2023);
    expect(r.semana_desde).toBe(1);
    expect(r.semana_hasta).toBe(53);
    expect(r.criterio_usado).toContain('anio completo');
  });

  test('detecta año suelto genérico', () => {
    const r = detectarPeriodo('dengue Loreto 2023');
    expect(r.anio).toBe(2023);
    expect(r.semana_desde).toBe(1);
    expect(r.semana_hasta).toBe(53);
  });

  test('retorna ventana por defecto sin periodo', () => {
    const r = detectarPeriodo('cuantos casos de dengue hay');
    expect(r.anio).toBeNull();
    expect(r.ventana_por_defecto).toBe(12);
    expect(r.criterio_usado).toContain('sin periodo detectado');
  });

  test('maneja string vacío', () => {
    const r = detectarPeriodo('');
    expect(r.anio).toBeNull();
    expect(r.ventana_por_defecto).toBe(12);
  });

  test('maneja null/undefined', () => {
    expect(detectarPeriodo(null).anio).toBeNull();
    expect(detectarPeriodo(undefined).anio).toBeNull();
  });
});

describe('resolverVentana', () => {
  const boletines = [
    { anio: 2026, semana_epidemiologica: 20, resumen: 'Resumen SE 20' },
    { anio: 2026, semana_epidemiologica: 25, resumen: 'Resumen SE 25' },
    { anio: 2026, semana_epidemiologica: 18, resumen: '' },
    { anio: 2026, semana_epidemiologica: 15, resumen: 'Resumen SE 15' },
  ];

  test('pasa tal cual si ya hay periodo explícito', () => {
    const deteccion = { anio: 2025, semana_desde: 10, semana_hasta: 20, criterio_usado: 'test' };
    const r = resolverVentana(deteccion, boletines);
    expect(r).toBe(deteccion);
  });

  test('calcula ventana desde la SE más reciente con resumen', () => {
    const deteccion = { anio: null, semana_desde: null, semana_hasta: null, ventana_por_defecto: 12, criterio_usado: 'test' };
    const r = resolverVentana(deteccion, boletines);
    expect(r.anio).toBeNull();
    expect(r.semana_hasta).toBe(25); // SE más reciente con resumen
    expect(r.semana_desde).toBe(14); // 25 - 11 = 14
    expect(r.anio_hasta).toBe(2026);
    expect(r.criterio_usado).toContain('ventana por defecto');
  });

  test('lanza error si no hay boletines con resumen', () => {
    const deteccion = { anio: null, ventana_por_defecto: 12, criterio_usado: 'test' };
    expect(() => resolverVentana(deteccion, [])).toThrow('No hay ningun boletin');
  });

  test('filtra boletines con resumen vacío o placeholder', () => {
    const bols = [
      { anio: 2026, semana_epidemiologica: 10, resumen: 'empty' },
      { anio: 2026, semana_epidemiologica: 11, resumen: 'null' },
      { anio: 2026, semana_epidemiologica: 12, resumen: 'Datos reales' },
    ];
    const deteccion = { anio: null, ventana_por_defecto: 12, criterio_usado: 'test' };
    const r = resolverVentana(deteccion, bols);
    expect(r.semana_hasta).toBe(12);
  });
});

describe('_internal.getSemanaEpi', () => {
  test('2026-07-05 → SE 27-2026 (ancla DGE)', () => {
    const r = _internal.getSemanaEpi('2026-07-05');
    expect(r).toEqual({ anio: 2026, semana: 27 });
  });

  test('2022-01-01 → SE 52-2021 (borde de año)', () => {
    const r = _internal.getSemanaEpi('2022-01-01');
    expect(r).toEqual({ anio: 2021, semana: 52 });
  });
});
