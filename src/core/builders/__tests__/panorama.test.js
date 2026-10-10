'use strict';

const {
  validarFiltrosPanorama, extraerAlertas, construirPanorama, CLAVES_PANORAMA,
} = require('../panorama');

const RESUMEN_CON_CIFRAS = [
  'SEMANA EPIDEMIOLOGICA: 26',
  'Dengue: 35423 casos acumulados, 47 defunciones.',
  '',
  '**Alertas y puntos clave:**',
  '- Brote de meningitis en Los Olivos (Lima), con un caso fallecido.',
  '- Incremento anticipado del virus sincitial: 1995 casos hasta la SE 26.',
  '',
  '[CIFRAS: dengue_total=35423; dengue_defunciones=47; ira_total=925374; ira_neumonias=14337; eda_total=653264; eda_disentericas=9974; sarampion_notificados=12]',
].join('\n');

const RESUMEN_SIN_CIFRAS = 'SEMANA EPIDEMIOLOGICA: 10\nDengue: sin cambios.';

describe('validarFiltrosPanorama', () => {
  test('body vacío o ausente = el más reciente', () => {
    expect(validarFiltrosPanorama(undefined).filtros).toEqual({ anio: 0, semana: 0 });
    expect(validarFiltrosPanorama({}).filtros).toEqual({ anio: 0, semana: 0 });
  });
  test('año y semana como número o texto', () => {
    expect(validarFiltrosPanorama({ anio: 2025, semana: '26' }).filtros).toEqual({ anio: 2025, semana: 26 });
  });
  test.each([
    [{ anio: 2009 }], [{ anio: 'abc' }], [{ anio: 2025.5 }], [{ anio: 99999 }],
    [{ semana: 5 }], [{ anio: 2025, semana: 0 }], [{ anio: 2025, semana: 54 }], [{ anio: 2025, semana: "1; DROP TABLE x" }],
    ['texto'], [[1, 2]],
  ])('rechaza %j', (body) => {
    const r = validarFiltrosPanorama(body);
    expect(r.valido).toBe(false);
    expect(r.filtros).toBeNull();
    expect(r.error).toMatch(/invalido/i);
  });
});

describe('extraerAlertas', () => {
  test('lee las viñetas bajo el encabezado y no trae el marcador', () => {
    expect(extraerAlertas(RESUMEN_CON_CIFRAS)).toEqual([
      'Brote de meningitis en Los Olivos (Lima), con un caso fallecido.',
      'Incremento anticipado del virus sincitial: 1995 casos hasta la SE 26.',
    ]);
  });
  test('máximo 3 y acepta distintos tipos de viñeta y encabezado', () => {
    const t = '## ALERTAS Y PUNTOS CLAVE\n* uno\n• dos\n1. tres\n- cuatro';
    expect(extraerAlertas(t)).toEqual(['uno', 'dos', 'tres']);
  });
  test('para en la primera línea que no es viñeta', () => {
    expect(extraerAlertas('Alertas:\n- a\nOtro bloque\n- b')).toEqual(['a']);
  });
  test('quita markdown y recorta textos largos', () => {
    const largo = 'x'.repeat(400);
    const r = extraerAlertas(`Alertas\n- **Importante** y \`código\`\n- ${largo}`);
    expect(r[0]).toBe('Importante y código');
    expect(r[1].length).toBe(280);
    expect(r[1].endsWith('…')).toBe(true);
  });
  test('sin bloque, vacío o no-string → []', () => {
    expect(extraerAlertas('Dengue: 5 casos.')).toEqual([]);
    expect(extraerAlertas('')).toEqual([]);
    expect(extraerAlertas(null)).toEqual([]);
    expect(extraerAlertas(undefined)).toEqual([]);
  });
});

describe('construirPanorama', () => {
  const filas = [
    { anio: 2025, semana: 27, fecha_publicacion: '2025-07-10', resumen: RESUMEN_SIN_CIFRAS },
    { anio: 2025, semana: 26, fecha_publicacion: new Date('2025-07-03T00:00:00Z'), resumen: RESUMEN_CON_CIFRAS },
    { anio: 2025, semana: 25, fecha_publicacion: null, resumen: RESUMEN_SIN_CIFRAS },
  ];

  test('sin filtros elige el más reciente QUE TRAE cifras y solo las claves del panorama', () => {
    const r = construirPanorama(filas, { anio: 0, semana: 0 }, { total: 3, con_cifras: 1 });
    expect(r.ok).toBe(true);
    expect(r.boletin).toEqual({
      anio: 2025, semana: 26, fecha_inicio: '2025-06-22', fecha_fin: '2025-06-28', fecha_publicacion: '2025-07-03',
    });
    expect(Object.keys(r.cifras).sort()).toEqual([...CLAVES_PANORAMA].sort());
    expect(r.cifras.dengue_total).toBe(35423);
    expect(r.cifras.sarampion_notificados).toBeUndefined();
    expect(r.tiene_cifras).toBe(true);
    expect(r.alertas).toHaveLength(2);
    expect(r.periodos).toEqual([{ anio: 2025, semana: 27 }, { anio: 2025, semana: 26 }, { anio: 2025, semana: 25 }]);
    expect(r.estado).toEqual({ boletines_procesados: 3, con_cifras: 1 });
    expect(r.riesgo).toBeNull();
  });

  test('si ninguno trae cifras, devuelve el más reciente con tiene_cifras=false', () => {
    const r = construirPanorama([filas[0], filas[2]], { anio: 0, semana: 0 });
    expect(r.boletin.semana).toBe(27);
    expect(r.cifras).toEqual({});
    expect(r.tiene_cifras).toBe(false);
  });

  test('con año y semana elige exactamente ese boletín (aunque no traiga cifras)', () => {
    const r = construirPanorama(filas, { anio: 2025, semana: 25 });
    expect(r.boletin.semana).toBe(25);
    expect(r.tiene_cifras).toBe(false);
  });

  test('boletín pedido que no existe → error', () => {
    expect(construirPanorama(filas, { anio: 2025, semana: 3 })).toEqual({ ok: false, error: 'Boletin no encontrado' });
  });

  test('sin boletines procesados → ok con boletin null', () => {
    const r = construirPanorama([], { anio: 0, semana: 0 }, { total: 0, con_cifras: 0 });
    expect(r).toMatchObject({ ok: true, boletin: null, cifras: {}, tiene_cifras: false, alertas: [], periodos: [] });
    expect(construirPanorama(undefined, undefined).boletin).toBeNull();
  });

  test('semana inexistente en ese año (2024 tiene 52): igual responde, sin fechas', () => {
    const r = construirPanorama([{ anio: 2024, semana: 53, resumen: RESUMEN_CON_CIFRAS }], { anio: 0, semana: 0 });
    expect(r.boletin.fecha_inicio).toBeNull();
    expect(r.boletin.fecha_fin).toBeNull();
  });

  test('filas con año/semana no numéricos se descartan; conteos como texto de Postgres', () => {
    const r = construirPanorama(
      [{ anio: 'x', semana: 3 }, { anio: '2025', semana: '26', resumen: RESUMEN_CON_CIFRAS }],
      { anio: 0, semana: 0 },
      { total: '42', con_cifras: '7' },
    );
    expect(r.periodos).toEqual([{ anio: 2025, semana: 26 }]);
    expect(r.estado).toEqual({ boletines_procesados: 42, con_cifras: 7 });
  });

  test('marcador con pares inválidos: solo entran los válidos', () => {
    const t = 'Alertas\n- a\n[CIFRAS: dengue_total=10; eda_total=abc]';
    const r = construirPanorama([{ anio: 2025, semana: 5, resumen: t }], { anio: 0, semana: 0 });
    expect(r.cifras).toEqual({ dengue_total: 10 });
  });
});
