// Tests — validators/filtros-consulta.js (HU-07: inyección SQL)
const { validarFiltrosConsulta, TABLAS_VALIDAS } = require('../filtros-consulta');

const ok = (b) => validarFiltrosConsulta(b);

describe('validarFiltrosConsulta — casos válidos', () => {
  test.each(TABLAS_VALIDAS)('acepta tabla %s sin filtros', (tabla) => {
    expect(ok({ tabla })).toEqual({
      valido: true, error: null,
      filtros: { tabla, departamento: '', anio: 0, pagina: 1 },
    });
  });

  test('acepta departamento, anio y pagina', () => {
    const r = ok({ tabla: 'dengue', departamento: '15', anio: 2014, pagina: 3 });
    expect(r.filtros).toEqual({ tabla: 'dengue', departamento: '15', anio: 2014, pagina: 3 });
  });

  test('acepta anio y pagina como string numérico', () => {
    const r = ok({ tabla: 'eda', anio: '2020', pagina: ' 2 ' });
    expect(r.filtros.anio).toBe(2020);
    expect(r.filtros.pagina).toBe(2);
  });

  test.each([undefined, null, ''])('trata %p como "sin filtro"', (v) => {
    const r = ok({ tabla: 'dengue', departamento: v, anio: v, pagina: v });
    expect(r.filtros).toEqual({ tabla: 'dengue', departamento: '', anio: 0, pagina: 1 });
  });

  test('acepta los 25 códigos de departamento, incluido Callao (07)', () => {
    for (let i = 1; i <= 25; i++) {
      const c = String(i).padStart(2, '0');
      expect(ok({ tabla: 'dengue', departamento: c }).valido).toBe(true);
    }
  });
});

describe('validarFiltrosConsulta — entradas hostiles', () => {
  test.each([
    "15' OR '1'='1",
    "15'; DROP TABLE caso_dengue;--",
    "15') UNION SELECT usename FROM pg_user--",
    '99', '00', '26', '1', '015', ' 15', '15 ', 15, ['15'], { a: 1 }, true,
  ])('rechaza departamento %p', (departamento) => {
    const r = ok({ tabla: 'dengue', departamento });
    expect(r.valido).toBe(false);
    expect(r.error).toMatch(/departamento/);
    expect(r.filtros).toBeNull();
  });

  test.each([
    '2020 OR 1=1', '2020; DROP TABLE x', '20.5', 2020.5, -1, 0, 2009, 2101,
    '9999999999', [2020], {}, true,
  ])('rechaza anio %p', (anio) => {
    const r = ok({ tabla: 'dengue', anio });
    expect(r.valido).toBe(false);
    expect(r.error).toMatch(/anio/);
  });

  test.each(['1; SELECT 1', 0, -5, 1.5, 100001, 'abc', [1]])('rechaza pagina %p', (pagina) => {
    const r = ok({ tabla: 'dengue', pagina });
    expect(r.valido).toBe(false);
    expect(r.error).toMatch(/pagina/);
  });

  test.each([undefined, null, '', 'otra', 'Dengue', "dengue'; --", ['dengue'], 1])(
    'rechaza tabla %p', (tabla) => {
      const r = ok({ tabla });
      expect(r.valido).toBe(false);
      expect(r.error).toMatch(/tabla/);
    });

  test.each([undefined, null, 'texto', 5, [], true])('rechaza body %p', (b) => {
    const r = ok(b);
    expect(r.valido).toBe(false);
    expect(r.error).toMatch(/Cuerpo/);
  });

  test('un body válido no arrastra campos extra', () => {
    const r = ok({ tabla: 'dengue', extra: "'; DROP TABLE x;--" });
    expect(Object.keys(r.filtros).sort()).toEqual(['anio', 'departamento', 'pagina', 'tabla']);
  });
});
