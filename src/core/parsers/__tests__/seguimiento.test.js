// Tests — parsers/seguimiento.js
const {
  esSeguimiento,
  preguntasPrevias,
  detectarPeriodoConHistorial,
  detectarDepartamentoConHistorial,
  detectarEnfermedadConHistorial,
  MAX_PREVIAS,
} = require('../seguimiento');
const { detectarPeriodo } = require('../periodo');
const { detectarDepartamento } = require('../departamento');
const { detectarEnfermedad } = require('../enfermedad');

describe('esSeguimiento', () => {
  test.each([
    '¿y en Piura?',
    'Y el clima en Piura?',
    'también en Lima',
    'ahora en 2024',
    'lo mismo para Cusco',
    '¿Y ahí cómo estuvo la lluvia?',
    'en esas semanas, ¿subió la temperatura?',
    'en Piura?',
    'en la SE 10 de 2026?',
    'para San Martín',
  ])('sí: %s', (q) => expect(esSeguimiento(q)).toBe(true));

  test.each([
    '¿Cuánto subió la temperatura en Ica en las últimas semanas?',
    'dime los casos de la semana epidemiológica 12 de 2025',
    '¿Cuántos casos de dengue hubo en Piura en 2024?',
    'en que departamentos de la costa se ha reportado un aumento sostenido de casos de dengue en los ultimos meses',
    '',
    '   ',
    undefined,
    null,
    42,
  ])('no: %p', (q) => expect(esSeguimiento(q)).toBe(false));
});

describe('preguntasPrevias', () => {
  test('arreglo de textos: respeta el orden y el tope', () => {
    const muchas = Array.from({ length: 10 }, (_, i) => `p${i}`);
    expect(preguntasPrevias(muchas)).toEqual(muchas.slice(0, MAX_PREVIAS));
  });
  test('acepta texto JSON (como a veces lo entrega Postgres)', () => {
    expect(preguntasPrevias('["a","b"]')).toEqual(['a', 'b']);
  });
  test('ignora lo que no es texto, lo vacío y lo inválido', () => {
    expect(preguntasPrevias(['a', null, 3, '  ', { x: 1 }, 'b'])).toEqual(['a', 'b']);
    expect(preguntasPrevias('no es json')).toEqual([]);
    expect(preguntasPrevias('{"a":1}')).toEqual([]);
    expect(preguntasPrevias(undefined)).toEqual([]);
    expect(preguntasPrevias(null)).toEqual([]);
    expect(preguntasPrevias(7)).toEqual([]);
  });
});

describe('detectarPeriodoConHistorial', () => {
  const previas = ['¿Cómo estuvo el clima en Ica en la SE 9-2026?'];

  test('seguimiento sin período: hereda el de la pregunta anterior y lo dice', () => {
    const r = detectarPeriodoConHistorial('¿y en Piura?', previas);
    expect(r).toMatchObject({ anio: 2026, semana_desde: 9, semana_hasta: 9, heredado: true });
    expect(r.criterio_usado).toBe('semana especifica: SE 9-2026 (tomado de la pregunta anterior)');
  });

  test('el período del mensaje nuevo manda sobre el heredado', () => {
    const r = detectarPeriodoConHistorial('¿y en 2024?', previas);
    expect(r).toEqual(detectarPeriodo('¿y en 2024?'));
    expect(r.anio).toBe(2024);
    expect(r.heredado).toBeUndefined();
  });

  test('pregunta completa e independiente (no es seguimiento): ventana por defecto, como siempre', () => {
    const q = '¿Cuántos casos de EDA hay?';
    expect(detectarPeriodoConHistorial(q, previas)).toEqual(detectarPeriodo(q));
  });

  test('sin historial: igual que el detector base', () => {
    expect(detectarPeriodoConHistorial('¿y en Piura?', [])).toEqual(detectarPeriodo('¿y en Piura?'));
    expect(detectarPeriodoConHistorial('¿y en Piura?', undefined)).toEqual(detectarPeriodo('¿y en Piura?'));
  });

  test('toma la pregunta anterior MÁS RECIENTE que tenga período (cadena de seguimientos)', () => {
    const cadena = ['¿y en Lima?', '¿y en Piura?', '¿Clima en Ica en la SE 9-2026?', 'casos de dengue en 2023'];
    expect(detectarPeriodoConHistorial('¿y en Cusco?', cadena).semana_desde).toBe(9);
  });

  test('si ninguna pregunta anterior tiene período, queda la ventana por defecto', () => {
    const r = detectarPeriodoConHistorial('¿y en Piura?', ['hola', '¿cómo estás?']);
    expect(r.ventana_por_defecto).toBe(12);
  });

  test('hereda también un rango de varios años', () => {
    const r = detectarPeriodoConHistorial('¿y en Cusco?', ['¿Clima en Ica en 2020, 2021 y 2022?']);
    expect(r).toMatchObject({ rango_anios: true, anio_desde: 2020, anio_hasta: 2022, heredado: true });
  });
});

describe('detectarDepartamentoConHistorial', () => {
  const previas = ['¿Cuántos casos de dengue hubo en Piura en 2024?'];

  test('seguimiento sin departamento: hereda el anterior', () => {
    expect(detectarDepartamentoConHistorial('¿y en 2023?', previas)).toEqual({
      departamento_detectado: 'piura', codigo_departamento: '20', heredado: true,
    });
  });

  test('el departamento del mensaje nuevo manda', () => {
    const r = detectarDepartamentoConHistorial('¿y en Lima?', previas);
    expect(r).toEqual(detectarDepartamento('¿y en Lima?'));
    expect(r.codigo_departamento).toBe('15');
  });

  test('"a nivel nacional" o "qué departamentos" NO heredan el departamento anterior', () => {
    for (const q of ['¿y a nivel nacional?', '¿y en todo el Perú?', 'y por departamento?', '¿Y en qué departamentos hubo más casos ahí?']) {
      expect(detectarDepartamentoConHistorial(q, previas).codigo_departamento).toBeNull();
    }
  });

  test('pregunta independiente: no hereda', () => {
    const q = '¿Cuántos casos de EDA hubo en 2022?';
    expect(detectarDepartamentoConHistorial(q, previas)).toEqual(detectarDepartamento(q));
  });

  test('sin historial o sin departamento en el historial: igual que el base', () => {
    expect(detectarDepartamentoConHistorial('¿y en 2023?', [])).toEqual(detectarDepartamento('¿y en 2023?'));
    expect(detectarDepartamentoConHistorial('¿y en 2023?', ['hola'])).toEqual(detectarDepartamento('¿y en 2023?'));
  });

  test('"epidemiológica" en el historial no cuenta como Ica', () => {
    const r = detectarDepartamentoConHistorial('¿y en 2023?', ['dime la semana epidemiológica 12']);
    expect(r.codigo_departamento).toBeNull();
  });
});

describe('detectarEnfermedadConHistorial', () => {
  const previas = ['¿Cuántos casos de dengue hubo en Piura en 2024?'];

  test('seguimiento sin enfermedad: hereda la anterior', () => {
    const r = detectarEnfermedadConHistorial('¿y en Lima?', previas);
    expect(r.enfermedades_activas).toEqual(['dengue']);
    expect(r.heredado).toBe(true);
    expect(r.criterio_enfermedad).toBe('detectadas: dengue (tomada de la pregunta anterior)');
  });

  test('la enfermedad del mensaje nuevo manda', () => {
    const r = detectarEnfermedadConHistorial('¿y de EDA?', previas);
    expect(r).toEqual(detectarEnfermedad('¿y de EDA?'));
    expect(r.enfermedades_activas).toEqual(['eda']);
  });

  test('otra enfermedad nombrada (sin serie propia) también cuenta como "nombró una"', () => {
    const r = detectarEnfermedadConHistorial('¿y de malaria?', previas);
    expect(r).toEqual(detectarEnfermedad('¿y de malaria?'));
    expect(r.otra_enfermedad_mencionada).toBe(true);
  });

  test('si el historial no nombra enfermedad (p. ej. preguntas de clima): las 4 fuentes, como siempre', () => {
    const r = detectarEnfermedadConHistorial('¿y en Piura?', ['¿Cómo estuvo el clima en Ica en la SE 9-2026?']);
    expect(r).toEqual(detectarEnfermedad('¿y en Piura?'));
    expect(r.enfermedades_activas).toHaveLength(4);
  });

  test('pregunta independiente: no hereda', () => {
    const q = 'dime los casos de la semana epidemiológica 12 de 2025';
    expect(detectarEnfermedadConHistorial(q, previas)).toEqual(detectarEnfermedad(q));
  });

  test('IRA combinada heredada conserva las dos fuentes', () => {
    const r = detectarEnfermedadConHistorial('¿y en Cusco?', ['casos de IRA en 2023']);
    expect(r.enfermedades_activas).toEqual(['ira_neumonia', 'ira_no_neumonia']);
  });
});
