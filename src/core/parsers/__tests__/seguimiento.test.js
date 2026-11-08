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

describe('Casos del PR #214', () => {
  const periodo = detectarPeriodoConHistorial;
  const departamento = detectarDepartamentoConHistorial;
  const enfermedad = detectarEnfermedadConHistorial;

  const SE9 = ['dengue en Piura en la SE 9 de 2026'];
  const A2024 = ['dengue en Piura en 2024'];

  describe('Hallazgo 1: un periodo relativo no hereda', () => {
    test.each([
      ['y en las ultimas 4 semanas?', SE9],
      ['y la semana pasada?', SE9],
      ['y cuantos casos hubo en las ultimas semanas?', SE9],
      ['ahora como esta el dengue esta semana?', SE9],
      ['y el año pasado?', A2024],
      ['y en lo que va del año?', A2024],
      ['y este año?', A2024],
      ['y este mes?', A2024],
      ['y hoy?', A2024],
      ['y actualmente?', A2024],
      ['entonces cual es la tendencia reciente?', A2024],
      ['y el ultimo boletin que dice?', A2024],
    ])('%s', (pregunta, previas) => {
      expect(periodo(pregunta, previas).heredado).toBeUndefined();
    });
  });

  describe('Hallazgo 2: una pregunta independiente no es seguimiento', () => {
    test.each([
      'en que consiste la EDA?',
      'para que sirve el boletin?',
      'de donde salen estos datos?',
      'de que trata el boletin mas reciente?',
      'con que modelo respondes?',
      'con que frecuencia aparece la EDA?',
      'pero que es el dengue?',
      'entonces que recomiendas para prevenir el dengue?',
      'entonces cual es la fuente de los datos?',
      'ademas que enfermedades vigilan?',
    ])('%s', (pregunta) => {
      expect(esSeguimiento(pregunta)).toBe(false);
    });
  });

  describe('Hallazgo 3: pedir otro alcance no hereda', () => {
    test.each([
      'y que departamento tuvo mas casos?',
      'entonces cual es el departamento con mas casos?',
      'y en el peru?',
      'y a nivel pais?',
      'y en todo Peru?',
      'y en el resto del pais?',
      'y en los demas departamentos?',
      'y en la costa?',
      'y en la selva?',
    ])('departamento: %s', (pregunta) => {
      expect(departamento(pregunta, A2024).codigo_departamento).toBeNull();
    });

    test.each([
      'y todas las enfermedades?',
      'y las otras enfermedades?',
      'y las demas enfermedades?',
    ])('enfermedad: %s', (pregunta) => {
      expect(enfermedad(pregunta, A2024).heredado).toBeUndefined();
    });
  });

  describe('Hallazgo 4: la herencia no salta un cambio de tema', () => {
    test('una pregunta nacional corta la herencia del departamento', () => {
      expect(departamento('y en 2022?', ['casos a nivel nacional de EDA', 'dengue en Piura en 2023']).codigo_departamento).toBeNull();
      expect(departamento('y la EDA?', ['como estuvo el clima a nivel nacional', 'dengue en Piura en 2023']).codigo_departamento).toBeNull();
    });
  });

  describe('Hallazgo 5: la semana sin año toma el año anterior', () => {
    test('y en la SE 10? tras 2024', () => {
      expect(Number(periodo('y en la SE 10?', A2024).anio)).toBe(2024);
    });
  });

  describe('Lo que ya funciona y debe seguir igual', () => {
    test('cambia el departamento y hereda el periodo', () => {
      const previas = ['clima en Ica en la SE 9 de 2026'];
      expect(departamento('y en Piura?', previas).departamento_detectado).toBe('piura');
      expect(periodo('y en Piura?', previas).heredado).toBe(true);
    });
    test('cambia el año y hereda el departamento', () => {
      expect(Number(periodo('y en 2023?', A2024).anio)).toBe(2023);
      expect(departamento('y en 2023?', A2024).heredado).toBe(true);
    });
    test('lo mismo para otro departamento', () => {
      expect(departamento('lo mismo para Tacna', A2024).departamento_detectado).toBe('tacna');
      expect(periodo('lo mismo para Tacna', A2024).heredado).toBe(true);
    });
    test('a nivel nacional quita el departamento', () => {
      expect(departamento('a nivel nacional?', A2024).codigo_departamento).toBeNull();
    });
    test('una pregunta completa no hereda', () => {
      expect(esSeguimiento('Cuantos casos de EDA hubo en Tacna en 2023?')).toBe(false);
    });
  });
});

describe('Revisión del PR #214: casos adicionales', () => {
  const A2024 = ['dengue en Piura en 2024'];
  const SE9 = ['dengue en Piura, SE 9-2026'];
  const cuenta = (texto, sub) => texto.split(sub).length - 1;

  describe('semana o mes sin año: toman el año de la pregunta anterior', () => {
    const campos = (d) => ({ anio: d.anio, semana_desde: d.semana_desde, semana_hasta: d.semana_hasta });

    test('mes sin año tras un año completo', () => {
      const r = detectarPeriodoConHistorial('y en marzo?', A2024);
      expect(r).toMatchObject({ ...campos(detectarPeriodo('marzo de 2024')), heredado: true });
      expect(r.criterio_usado).toBe('mes especifico: marzo 2024 (año tomado de la pregunta anterior)');
    });

    test('mes sin año tras una semana de otro año: usa el año de esa semana', () => {
      expect(detectarPeriodoConHistorial('y en enero?', SE9)).toMatchObject({ ...campos(detectarPeriodo('enero de 2026')), heredado: true });
    });

    test('semana sin año tras otra semana', () => {
      expect(detectarPeriodoConHistorial('y en la SE 10?', SE9)).toMatchObject({ anio: 2026, semana_desde: 10, semana_hasta: 10, heredado: true });
      expect(detectarPeriodoConHistorial('y en la SE 10?', A2024)).toMatchObject({ anio: 2024, semana_desde: 10, semana_hasta: 10, heredado: true });
    });

    test('rango de meses sin año: el año va al final del rango', () => {
      const r = detectarPeriodoConHistorial('y entre enero y marzo?', A2024);
      expect(r).toMatchObject({ ...campos(detectarPeriodo('entre enero y marzo de 2024')), heredado: true });
    });

    test('el mes va aunque la pregunta siga con otra cosa', () => {
      expect(detectarPeriodoConHistorial('y en marzo en Piura?', A2024)).toMatchObject({ anio: 2024, heredado: true });
    });

    test('la pregunta anterior también era un seguimiento: se arrastra el año de la cadena', () => {
      const r = detectarPeriodoConHistorial('y en Lima?', ['y en la SE 10?', 'dengue en Piura en 2024']);
      expect(r).toMatchObject({ anio: 2024, semana_desde: 10, semana_hasta: 10, heredado: true });
      expect(cuenta(r.criterio_usado, 'pregunta anterior')).toBe(1);
    });

    test('si el mensaje trae el año, manda el mensaje', () => {
      const r = detectarPeriodoConHistorial('y en la SE 10 de 2023?', A2024);
      expect(r).toEqual(detectarPeriodo('y en la SE 10 de 2023?'));
      expect(r.heredado).toBeUndefined();
    });

    test('sin año anterior que usar: queda como el detector base', () => {
      for (const previas of [[], ['hola'], ['clima en Ica en 2020, 2021 y 2022']]) {
        expect(detectarPeriodoConHistorial('y en la SE 10?', previas).heredado).toBeUndefined();
      }
      expect(detectarPeriodoConHistorial('y en la SE 10?', [])).toEqual(detectarPeriodo('y en la SE 10?'));
    });

    test('una pregunta completa con semana y sin año no cambia (no es seguimiento)', () => {
      const q = 'Dime los casos de la SE 12';
      expect(detectarPeriodoConHistorial(q, A2024)).toEqual(detectarPeriodo(q));
    });
  });

  describe('período relativo', () => {
    test('el departamento sí se hereda; el período no', () => {
      expect(detectarDepartamentoConHistorial('y la semana pasada?', A2024).departamento_detectado).toBe('piura');
      expect(detectarPeriodoConHistorial('y la semana pasada?', A2024).heredado).toBeUndefined();
    });

    test('una pregunta relativa en medio de la cadena corta la herencia del período', () => {
      const r = detectarPeriodoConHistorial('y en Lima?', ['y la semana pasada?', 'dengue en Piura en la SE 9 de 2026']);
      expect(r.heredado).toBeUndefined();
      expect(r.ventana_por_defecto).toBe(12);
    });
  });

  describe('la herencia no salta un cambio de tema', () => {
    test('una pregunta completa corta la cadena: lo que dijo sí cuenta, lo anterior no', () => {
      const previas = ['cuantos casos de EDA hubo?', 'clima en Ica en la SE 9 de 2026'];
      expect(detectarPeriodoConHistorial('y en Piura?', previas).heredado).toBeUndefined();
      expect(detectarDepartamentoConHistorial('y en 2023?', previas).codigo_departamento).toBeNull();
      const e = detectarEnfermedadConHistorial('y en Piura?', previas);
      expect(e.enfermedades_activas).toEqual(['eda']);
      expect(e.heredado).toBe(true);
    });

    test('4 preguntas atrás tras un cambio de tema no se usa', () => {
      const previas = ['que es el dengue?', 'hola', 'gracias', 'clima en Ica en 2020'];
      expect(detectarPeriodoConHistorial('y en Tacna?', previas).heredado).toBeUndefined();
      expect(detectarDepartamentoConHistorial('y en 2021?', previas).codigo_departamento).toBeNull();
    });

    test('una cadena de seguimientos sí llega hasta el origen', () => {
      const previas = ['y en Cusco?', 'y en Lima?', 'clima en Ica en 2020'];
      expect(detectarPeriodoConHistorial('y en Tacna?', previas)).toMatchObject({ anio: 2020, heredado: true });
      expect(detectarDepartamentoConHistorial('y en 2021?', ['y en 2022?', 'y en 2023?', 'dengue en Piura en 2024']).departamento_detectado).toBe('piura');
    });

    test('un seguimiento nacional en medio corta el departamento', () => {
      expect(detectarDepartamentoConHistorial('y en 2022?', ['y a nivel nacional?', 'dengue en Piura en 2023']).codigo_departamento).toBeNull();
    });

    test('la enfermedad heredada de una cadena no repite la nota del criterio', () => {
      const e = detectarEnfermedadConHistorial('y en Cusco?', ['y en Lima?', 'casos de IRA en 2023']);
      expect(e.enfermedades_activas).toEqual(['ira_neumonia', 'ira_no_neumonia']);
      expect(cuenta(e.criterio_enfermedad, 'pregunta anterior')).toBe(1);
    });
  });

  describe('alcance: otro alcance no hereda', () => {
    test('«qué enfermedad…» tampoco hereda la enfermedad', () => {
      expect(detectarEnfermedadConHistorial('y que enfermedad tuvo mas casos?', A2024).heredado).toBeUndefined();
    });
    test('si el mensaje nombra el departamento, manda aunque diga «en el Perú»', () => {
      expect(detectarDepartamentoConHistorial('y en Lima, en el Peru?', A2024).codigo_departamento).toBe('15');
    });
  });

  describe('esSeguimiento: conectores y preposiciones', () => {
    test.each([
      'igual que en 2023?',
      'o en Lima?',
      'ahora en Piura?',
      'y que enfermedades hay?',
    ])('sí: %s', (q) => expect(esSeguimiento(q)).toBe(true));

    test.each([
      'o que es el dengue?',
      'tambien como se previene?',
      'a que se debe el aumento?',
      'sobre que base se calcula?',
      'en cuantos departamentos hay casos de EDA?',
    ])('no: %s', (q) => expect(esSeguimiento(q)).toBe(false));
  });
});
