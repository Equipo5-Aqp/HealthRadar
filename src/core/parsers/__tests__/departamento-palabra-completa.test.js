// Tests — parsers/departamento.js: el nombre se busca como palabra completa y gana el primero mencionado
const { detectarDepartamento, DEPARTAMENTOS } = require('../departamento');

describe('detectarDepartamento — palabra completa', () => {
  test.each([
    '¿Cuántos casos de IRA hubo en la última semana publicada?',
    'Dame la situación epidemiológica de esta semana',
    'situación específica de EDA',
    'dengue en la clínica de la zona',
    'información pública del dengue',
    'datos típicos de la temporada',
  ])('"ica" dentro de otra palabra no es el departamento Ica: "%s"', (pregunta) => {
    expect(detectarDepartamento(pregunta).departamento_detectado).toBeNull();
  });

  test('el departamento correcto gana aunque la pregunta tenga palabras terminadas en "ica"', () => {
    expect(detectarDepartamento('situación epidemiológica del dengue en Piura en 2024').departamento_detectado).toBe('piura');
    expect(detectarDepartamento('dengue en Lima en 2023 según la información publicada').departamento_detectado).toBe('lima');
    expect(detectarDepartamento('dengue en Loreto, la última semana publicada').codigo_departamento).toBe('16');
  });

  test('Ica se sigue detectando cuando se nombra de verdad', () => {
    for (const q of ['dengue en Ica', 'casos en Ica.', '(Ica) 2024', '¿Y en Ica?', 'ICA y EDA']) {
      expect(detectarDepartamento(q)).toEqual({ departamento_detectado: 'ica', codigo_departamento: '11' });
    }
  });

  test('con varios departamentos toma el que aparece primero en la pregunta, no el primero de la lista', () => {
    expect(detectarDepartamento('compara Piura y Lima').departamento_detectado).toBe('piura');
    expect(detectarDepartamento('compara Lima y Piura').departamento_detectado).toBe('lima');
    expect(detectarDepartamento('Ucayali o Amazonas').departamento_detectado).toBe('ucayali');
  });

  test('nombres compuestos y con tilde o mayúsculas', () => {
    expect(detectarDepartamento('LA LIBERTAD').codigo_departamento).toBe('13');
    expect(detectarDepartamento('en Madre de Dios').codigo_departamento).toBe('17');
    expect(detectarDepartamento('San Martín 2024').codigo_departamento).toBe('22');
    expect(detectarDepartamento('Áncash y Huánuco').departamento_detectado).toBe('ancash');
  });

  test('un nombre pegado a otras letras no cuenta ("limache", "pascoral")', () => {
    expect(detectarDepartamento('limache').departamento_detectado).toBeNull();
    expect(detectarDepartamento('pascoral').departamento_detectado).toBeNull();
  });

  test('los 25 departamentos se siguen detectando por su nombre', () => {
    for (const [nombre, codigo] of Object.entries(DEPARTAMENTOS)) {
      expect(detectarDepartamento(`casos de dengue en ${nombre} en 2024`).codigo_departamento).toBe(codigo);
    }
  });

  test('entradas que no son texto se tratan como vacías (no lanzan)', () => {
    for (const v of [123, {}, [], true, null, undefined]) {
      expect(detectarDepartamento(v)).toEqual({ departamento_detectado: null, codigo_departamento: null });
    }
  });
});
