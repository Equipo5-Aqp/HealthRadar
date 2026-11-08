// Tests — parsers/periodo.js
const { detectarPeriodo, resolverVentana, _internal } = require('../periodo');

describe('detectarPeriodo', () => {
  test('detecta rango entre meses', () => {
    const r = detectarPeriodo('entre marzo y mayo de 2025');
    expect(r.anio).toBe(2025);
    expect(r.semana_desde).toBeLessThanOrEqual(r.semana_hasta);
    expect(r.criterio_usado).toContain('rango');
  });

  test.each([
    ['que brotes hubo en la semana 5 del 2025', 2025],
    ['semana 5 de 2025', 2025],
    ['semana 5 en el 2025', 2025],
    ['semana 5 del año 2025', 2025],
    ['semana 5 en 2025', 2025],
    ['SE 5 2025', 2025],
    ['SE 5-2025', 2025],
    ['SE5/2025', 2025],
    ['semana 5, 2025', 2025],
    ['la semana 12 de 2024', 2024],
  ])('semana con año y conector: "%s" → año %i', (pregunta, anio) => {
    const r = detectarPeriodo(pregunta);
    expect(r.anio).toBe(anio);
    expect(r.semana_desde).toBe(Number(pregunta.match(/\d+/)[0]));
    expect(r.semana_desde).toBe(r.semana_hasta);
    expect(r.criterio_usado).toBe(`semana especifica: SE ${r.semana_desde}-${anio}`);
  });

  test('año antes que la semana: "casos del 2025 en la semana 5"', () => {
    const r = detectarPeriodo('casos de dengue del 2025 en la semana 5');
    expect(r.anio).toBe(2025);
    expect(r.semana_desde).toBe(5);
    expect(r.criterio_usado).toBe('semana especifica: SE 5-2025');
  });

  test('el año junto a la semana manda sobre otro año suelto de la pregunta', () => {
    expect(detectarPeriodo('comparado con 2024, semana 5 del 2025').anio).toBe(2025);
  });

  test('semana sin año usa el año actual', () => {
    expect(detectarPeriodo('semana 5').anio).toBe(new Date().getFullYear());
  });

  test('"se" o "semana" dentro de otra palabra no se toma como semana', () => {
    expect(detectarPeriodo('el pase 12 de la base 3').criterio_usado).toMatch(/sin periodo/);
  });

  test('un número sin relación después de la semana no se confunde con el año', () => {
    const r = detectarPeriodo('semana 5 con 120 casos');
    expect(r.semana_desde).toBe(5);
    expect(r.anio).toBe(new Date().getFullYear());
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

describe('detectarPeriodo: períodos relativos a hoy', () => {
  // Domingo 8-nov-2026 (10:00 en Lima): SE 45-2026. La semana epidemiológica va de domingo a sábado.
  const HOY = new Date('2026-11-08T15:00:00Z');
  const d = (q, ahora = HOY) => detectarPeriodo(q, ahora);

  describe('año', () => {
    test.each([
      ['¿Cuántos casos de dengue hubo este año?', 2026],
      ['casos en lo que va del año', 2026],
      ['casos en el año actual', 2026],
      ['casos de dengue el año pasado', 2025],
      ['¿Y el año anterior?', 2025],
      ['hace dos años', 2024],
      ['hace 3 años', 2023],
      ['hace un año', 2025],
    ])('%s → año %i completo', (q, anio) => {
      expect(d(q)).toMatchObject({ anio, semana_desde: 1, semana_hasta: 53, relativo_a: '2026-11-08' });
    });

    test('el criterio le dice al modelo contra qué fecha se midió', () => {
      expect(d('el año pasado').criterio_usado).toContain('relativo a hoy 2026-11-08');
    });

    test('se combina con un mes o una semana', () => {
      const marzo = detectarPeriodo('marzo de 2025');
      expect(d('casos en marzo del año pasado')).toMatchObject({ anio: 2025, semana_desde: marzo.semana_desde, semana_hasta: marzo.semana_hasta, relativo_a: '2026-11-08' });
      expect(d('casos en marzo del año pasado').criterio_usado).toContain('mes especifico: marzo 2025');
      expect(d('la SE 10 de este año')).toMatchObject({ anio: 2026, semana_desde: 10, semana_hasta: 10 });
    });

    test('se combina con un año escrito: compara 2024 con este año', () => {
      expect(d('compara 2024 con este año')).toMatchObject({ rango_anios: true, anio_desde: 2024, anio_hasta: 2026 });
    });
  });

  describe('mes', () => {
    test('este mes = noviembre 2026 y el mes pasado = octubre 2026', () => {
      expect(d('¿Cómo estuvo el clima este mes?')).toMatchObject({ anio: 2026, semana_desde: 44, semana_hasta: 48 }); // 1-nov (domingo) a 30-nov (lunes)
      expect(d('este mes').criterio_usado).toContain('noviembre 2026');
      expect(d('el mes pasado').criterio_usado).toContain('octubre 2026');
      expect(d('el mes anterior').criterio_usado).toContain('octubre 2026');
    });

    test('en enero, el mes pasado es diciembre del año anterior', () => {
      const enero = new Date('2026-01-10T15:00:00Z');
      expect(d('el mes pasado', enero).criterio_usado).toContain('diciembre 2025');
      expect(d('este mes', enero).criterio_usado).toContain('enero 2026');
    });
  });

  describe('semana y día', () => {
    test.each([
      ['esta semana', 45],
      ['la semana actual', 45],
      ['¿cómo está el dengue hoy?', 45],
      ['en este momento', 45],
      ['ayer', 44],
      ['anteayer', 44],
      ['la semana pasada', 44],
      ['la semana anterior', 44],
      ['la última semana', 44],
    ])('%s → SE %i-2026', (q, semana) => {
      expect(d(q)).toMatchObject({ anio: 2026, semana_desde: semana, semana_hasta: semana, relativo_a: '2026-11-08' });
    });

    test('«la última semana de marzo de 2024» sigue siendo marzo de 2024, no «la semana pasada»', () => {
      expect(d('la última semana de marzo de 2024')).toEqual(detectarPeriodo('la última semana de marzo de 2024', new Date('2030-01-01')));
      expect(d('la última semana de marzo de 2024').criterio_usado).toBe('mes especifico: marzo 2024');
    });

    test('«ayer» y «la semana pasada» cruzan el límite de año', () => {
      const lunes = new Date('2026-01-05T15:00:00Z'); // SE 1-2026 empieza el 4-ene
      expect(d('la semana pasada', lunes)).toMatchObject({ anio: 2025, semana_desde: 53 });
      expect(d('ayer', lunes)).toMatchObject({ anio: 2026, semana_desde: 1 });
    });
  });

  describe('ventanas móviles que terminan hoy', () => {
    test('las últimas 4 semanas: SE 42 a SE 45', () => {
      expect(d('¿Cuánto subió la temperatura en las últimas 4 semanas?')).toMatchObject({ anio: 2026, semana_desde: 42, semana_hasta: 45 });
      expect(d('las últimas cuatro semanas')).toMatchObject({ anio: 2026, semana_desde: 42, semana_hasta: 45 });
    });

    test('los últimos 6 meses y el último trimestre caben en 2026', () => {
      expect(d('los últimos 6 meses')).toMatchObject({ anio: 2026, semana_desde: 18, semana_hasta: 45 });
      expect(d('el último trimestre')).toMatchObject({ anio: 2026, semana_desde: 31, semana_hasta: 45 });
      expect(d('el último semestre')).toMatchObject({ anio: 2026, semana_desde: 18, semana_hasta: 45 });
      expect(d('el último mes')).toMatchObject({ anio: 2026, semana_desde: 40, semana_hasta: 45 });
    });

    test('el último año cruza de año: formato de ventana con ventana_relativa', () => {
      const r = d('¿Cuántos casos de dengue hubo el último año?');
      expect(r).toMatchObject({
        anio: null, anio_desde: 2025, semana_desde: 45, anio_hasta: 2026, semana_hasta: 45,
        ventana_relativa: true, relativo_a: '2026-11-08',
      });
      expect(r.criterio_usado).toBe('ultimo ano (hoy 2026-11-08): SE 45-2025 a SE 45-2026');
      expect(d('los últimos 12 meses')).toMatchObject({ anio_desde: 2025, semana_desde: 45, ventana_relativa: true });
    });

    test('los últimos 2 años llegan hasta 2024', () => {
      expect(d('los últimos 2 años')).toMatchObject({ anio_desde: 2024, semana_desde: 45, anio_hasta: 2026, ventana_relativa: true });
    });

    test('al inicio del año una ventana corta también cruza', () => {
      const enero = new Date('2026-01-10T15:00:00Z'); // sábado: SE 1-2026 (4 al 10 de enero)
      expect(d('las últimas 4 semanas', enero)).toMatchObject({ anio: null, anio_desde: 2025, semana_desde: 51, anio_hasta: 2026, semana_hasta: 1, ventana_relativa: true });
    });

    test('31 de mayo menos un mes no se pasa de día (30 de abril)', () => {
      const f = _internal.sumarMeses(new Date(Date.UTC(2026, 4, 31)), -1);
      expect(f.toISOString().slice(0, 10)).toBe('2026-04-30');
    });

    test('números fuera de rango no se interpretan', () => {
      for (const q of ['las últimas 0 semanas', 'las últimas 999 semanas', 'los últimos 500 meses', 'los últimos 50 años']) {
        expect(d(q).ventana_por_defecto).toBe(12);
      }
    });
  });

  describe('lo difuso no se interpreta (ventana por defecto)', () => {
    test.each([
      '¿Cuál es la tendencia reciente?',
      '¿Cómo está el dengue actualmente?',
      '¿Cuántos casos hubo en las últimas semanas?',
      '¿Qué dice el último boletín?',
      '¿Cuántos casos hubo en verano?',
      'los últimos meses',
    ])('%s', (q) => {
      expect(d(q)).toMatchObject({ anio: null, ventana_por_defecto: 12 });
      expect(d(q).relativo_a).toBeUndefined();
    });
  });

  describe('lo escrito con número manda sobre lo relativo', () => {
    test('un año, semana o mes explícitos ganan a «hoy» o «ayer»', () => {
      expect(d('casos de dengue en 2024, dímelo hoy')).toEqual(detectarPeriodo('casos de dengue en 2024'));
      expect(d('casos de la SE 9 de 2026 de ayer').criterio_usado).toBe('semana especifica: SE 9-2026');
    });
    test('un año explícito gana a «las últimas 4 semanas»', () => {
      expect(d('las últimas 4 semanas de 2024')).toEqual(detectarPeriodo('las últimas 4 semanas de 2024'));
      expect(d('las últimas 4 semanas de 2024').criterio_usado).toBe('anio completo: 2024');
    });
    test('sin ninguna expresión relativa el resultado es el de siempre', () => {
      for (const q of ['casos en 2025', 'SE 9 de 2026', 'entre marzo y mayo de 2025', 'dime los casos']) {
        expect(d(q)).toEqual(detectarPeriodo(q));
        expect(d(q).relativo_a).toBeUndefined();
      }
    });
  });

  describe('fecha de hoy', () => {
    test('se calcula en Lima: a las 02:00 UTC del 9-nov todavía es 8-nov en Lima', () => {
      expect(_internal.hoyEnLima(new Date('2026-11-09T02:00:00Z'))).toEqual({ anio: 2026, mes: 11, dia: 8, iso: '2026-11-08' });
      expect(d('esta semana', new Date('2026-11-09T02:00:00Z')).semana_desde).toBe(45);
      expect(d('esta semana', new Date('2026-11-09T06:00:00Z')).semana_desde).toBe(45); // lunes 9 en Lima: misma semana
    });
    test('sin fecha inyectada usa la real y una fecha inválida también', () => {
      expect(detectarPeriodo('este año').anio).toBe(_internal.hoyEnLima().anio);
      expect(detectarPeriodo('este año', new Date('no es fecha')).anio).toBe(_internal.hoyEnLima().anio);
    });
  });
});

describe('resolverVentana: ventana relativa', () => {
  const sinBoletines = [];
  test('una ventana móvil ya resuelta pasa tal cual (aunque no haya boletines)', () => {
    const det = detectarPeriodo('el último año', new Date('2026-11-08T15:00:00Z'));
    expect(resolverVentana(det, sinBoletines)).toBe(det);
  });
  test('sin rango completo no se respeta y cae en la ventana por defecto', () => {
    const roto = { anio: null, ventana_relativa: true, anio_desde: 2025, criterio_usado: 'x' };
    expect(() => resolverVentana(roto, sinBoletines)).toThrow('No hay ningun boletin');
  });
});
