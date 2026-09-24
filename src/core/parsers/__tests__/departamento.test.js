// Tests — parsers/departamento.js
const { detectarDepartamento, DEPARTAMENTOS } = require('../departamento');

describe('detectarDepartamento', () => {
  test('detecta departamento simple', () => {
    const r = detectarDepartamento('dengue en Loreto');
    expect(r.departamento_detectado).toBe('loreto');
    expect(r.codigo_departamento).toBe('16');
  });

  test('detecta departamento con tilde', () => {
    const r = detectarDepartamento('casos en Junín');
    expect(r.departamento_detectado).toBe('junin');
    expect(r.codigo_departamento).toBe('12');
  });

  test('detecta departamento compuesto', () => {
    const r = detectarDepartamento('la libertad tiene muchos casos');
    expect(r.departamento_detectado).toBe('la libertad');
    expect(r.codigo_departamento).toBe('13');
  });

  test('detecta Callao', () => {
    const r = detectarDepartamento('casos en Callao');
    expect(r.departamento_detectado).toBe('callao');
    expect(r.codigo_departamento).toBe('07');
  });

  test('retorna null si no detecta departamento', () => {
    const r = detectarDepartamento('cuantos casos de dengue hay');
    expect(r.departamento_detectado).toBeNull();
    expect(r.codigo_departamento).toBeNull();
  });

  test('maneja input vacío', () => {
    const r = detectarDepartamento('');
    expect(r.departamento_detectado).toBeNull();
  });

  test('maneja null/undefined', () => {
    expect(detectarDepartamento(null).departamento_detectado).toBeNull();
    expect(detectarDepartamento(undefined).departamento_detectado).toBeNull();
  });

  test('diccionario tiene 25 departamentos', () => {
    expect(Object.keys(DEPARTAMENTOS)).toHaveLength(25);
  });
});
