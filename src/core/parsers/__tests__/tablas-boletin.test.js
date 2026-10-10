'use strict';
const { extraerCifrasTablas, bloqueCifrasVerificadas } = require('../tablas-boletin');
const core = require('../../index');
const { validarResumenBoletin } = require('../../validators/resumen-boletin');

// Extracto del texto real que entrega "Extract from File" para el Boletín SE 26-2025 (filas partidas incluidas).
const SE26 = [
  'Tabla 1. Enfermedades/eventos sujetos a vigilancia epidemiológica, semana epidemiológica 26, años 2024-2025',
  'Confirmados Probables Confirmados Probables Confirmados Probables Confirmados Probables',
  'Antrax (carbunco) 0 0 0 0 0 0,00 0 0 0 0 ',
  '0 0,00',
  'Dengue sin signos de alarma ',
  '838 27 227584 2754 0 675,26 119 551 22492 7266 0 87,49',
  'Dengue con signos de alarma 121 2 23498 74 0 69,10 26 83 4405 1113 0 16,22',
  'Dengue grave 2 0 680 2 245 2,00 1 2 131 16 47 0,43',
  'Perú 0 0 5518 147 29758 35423 104,15 20 1 21 ',
  'Muerte materna directa 4 81 81 3 52 52',
  'Muerte materna directa tardía 0 ',
  '0 0 0 2 2',
  'Ofidismo 42 0 1186 0 6 3,48 39 0 1181 0 5 3,47',
  'Perú 0,97 1,93 329 52 273 4 97,66 100,00 86,02 92,72 91,05 46,96',
  'Perú ',
  '0,63 1,25 49 ',
  '97,66 ',
  '73,91 81,40 5 0',
  '% Seguimiento de secuela',
  'En la SE 25 - 2025 se notificaron 329 casos sospechosos de enfermedades febriles eruptivas: 206 casos de sarampión',
  'y 123 casos sospechosos de rubéola.',
  'Tabla 3. Episodios de las enfermedades diarréicas agudas por Direcciones de Salud, semana epidemiológica 26,',
  'Amazonas Amazonas 1 2 3',
  'Perú 23168 680343 345 9397 5215 37 689740 21977 643290 292 9974 5879 19 653264',
  'Tabla 4. Episodios de las infecciones respiratorias agudas por Direcciones de Salud, semana epidemiológica 26,',
  'Perú 47940 972276 944 11945 4023 97 984221 45927 911037 869 14337 5098 67 925374',
].join('\n');

const ESPERADO_SE26 = {
  dengue_sin_alarma: 29758, dengue_con_alarma: 5518, dengue_graves: 147, dengue_total: 35423, dengue_defunciones: 47,
  muerte_materna_directa: 52, ofidismo_total: 1181,
  eda_acuosas: 643290, eda_disentericas: 9974, eda_total: 653264,
  ira_neumonias: 14337, ira_total: 925374, pfa_total: 49, sarampion_notificados: 206,
};

describe('extraerCifrasTablas', () => {
  test('lee las 14 cifras de la SE 26 tomando la mitad derecha (2025), incluso con filas partidas', () => {
    expect(extraerCifrasTablas(SE26)).toEqual(ESPERADO_SE26);
  });

  test('acepta tabuladores entre columnas (otra librería de PDF)', () => {
    const conTabs = SE26.split('\n').map(l => (/^[A-Z]/.test(l) && /\d/.test(l) ? l.replace(/ (?=\d)/g, '\t') : l)).join('\n');
    expect(extraerCifrasTablas(conTabs)).toEqual(ESPERADO_SE26);
  });

  test('acepta la otra redacción de sarampión (SE 25)', () => {
    const t = SE26.replace('329 casos sospechosos de enfermedades febriles eruptivas: 206 casos de sarampión',
      '329 casos de enfermedades febriles eruptivas: 206 casos sospechosos de sarampión');
    expect(extraerCifrasTablas(t).sarampion_notificados).toBe(206);
  });

  test('"Muerte materna directa" no toma la fila "tardía"', () => {
    const r = extraerCifrasTablas('Muerte materna directa tardía 0 0 0 0 2 2\nMuerte materna directa 5 77 77 1 49 49');
    expect(r.muerte_materna_directa).toBe(49);
  });

  test('IRA: si neumonías + IRAS no neumonías no suman el total, no devuelve ninguna cifra de IRA', () => {
    const r = extraerCifrasTablas(SE26.replace('911037 869 14337', '911037 869 14000'));
    expect(r.ira_total).toBeUndefined();
    expect(r.ira_neumonias).toBeUndefined();
    expect(r.eda_total).toBe(653264);
  });

  test('EDA: si acuosas + disentéricas no suman el total, se omite', () => {
    const r = extraerCifrasTablas(SE26.replace('643290 292 9974', '643290 292 9900'));
    expect(r.eda_total).toBeUndefined();
  });

  test('dengue: si falta una de las tres filas no devuelve nada de dengue', () => {
    const r = extraerCifrasTablas(SE26.replace('Dengue grave 2 0 680', 'Dengue g 2 0 680'));
    expect(r.dengue_total).toBeUndefined();
    expect(r.ofidismo_total).toBe(1181);
  });

  test('fila con cantidad de números distinta a la esperada se ignora', () => {
    expect(extraerCifrasTablas('Ofidismo 42 0 1186 0 6 3,48 39 0 1181 0 5').ofidismo_total).toBeUndefined();
  });

  test('entradas inválidas devuelven objeto vacío', () => {
    expect(extraerCifrasTablas(undefined)).toEqual({});
    expect(extraerCifrasTablas('')).toEqual({});
    expect(extraerCifrasTablas('texto sin tablas')).toEqual({});
  });

  test('una fila "Perú" que no es de PFA (sin decimales en las posiciones esperadas) no se toma como PFA', () => {
    expect(extraerCifrasTablas('Perú 1 2 3 4 5 6 7 8').pfa_total).toBeUndefined();
  });
});

describe('validarResumenBoletin contra las tablas del PDF', () => {
  const relleno = '\n' + 'Texto de relleno del boletín. '.repeat(30);
  const fuente = SE26 + relleno;
  const resumen = c => `SEMANA EPIDEMIOLOGICA: 26\nDengue...\n[CIFRAS: ${c}]`;

  test('caso real SE 26: dengue_defunciones=119 (casos de la semana) se rechaza con el valor de la tabla', () => {
    expect(() => validarResumenBoletin(resumen('dengue_total=35423; dengue_defunciones=119'), 'gemini', 26, { textoFuente: fuente }))
      .toThrow(/dengue_defunciones: el resumen dice 119 y la tabla del boletín dice 47/);
  });

  test('caso real SE 26: ofidismo 1186 (2024) y sarampión 329 (febriles) se rechazan', () => {
    expect(() => validarResumenBoletin(resumen('ofidismo_total=1186; sarampion_notificados=329'), 'gemini', 26, { textoFuente: fuente }))
      .toThrow(/ofidismo_total: el resumen dice 1 186 y la tabla del boletín dice 1 181.*sarampion_notificados: el resumen dice 329 y la tabla del boletín dice 206/);
  });

  test('con las cifras correctas pasa y devuelve cifrasTablas', () => {
    const r = validarResumenBoletin(resumen('dengue_total=35423; dengue_defunciones=47; ofidismo_total=1181'), 'gemini', 26, { textoFuente: fuente });
    expect(r.cifrasTablas).toEqual(ESPERADO_SE26);
    expect(r.advertencias).toEqual([]);
  });

  test("modoTablas 'advertir' no rechaza: deja una advertencia", () => {
    const r = validarResumenBoletin(resumen('dengue_defunciones=119'), 'gemini', 26, { textoFuente: fuente, modoTablas: 'advertir' });
    expect(r.advertencias.join(' ')).toMatch(/difieren de la tabla.*dengue_defunciones/);
  });

  test('una clave que la tabla no pudo leer no genera rechazo (solo se contrasta lo que se leyó)', () => {
    const sinPfa = fuente.replace('0,63 1,25 49 ', '');
    const r = validarResumenBoletin(resumen('pfa_total=46'), 'gemini', 26, { textoFuente: sinPfa });
    expect(r.cifrasTablas.pfa_total).toBeUndefined();
  });
});

describe('bloqueCifrasVerificadas', () => {
  test('arma el bloque con clave=valor separadas por punto y coma', () => {
    const b = bloqueCifrasVerificadas({ dengue_total: 35423, dengue_defunciones: 47 });
    expect(b).toMatch(/^CIFRAS VERIFICADAS DEL BOLETIN/);
    expect(b).toMatch(/dengue_total=35423; dengue_defunciones=47$/);
  });
  test('sin cifras devuelve cadena vacía', () => {
    expect(bloqueCifrasVerificadas({})).toBe('');
    expect(bloqueCifrasVerificadas(undefined)).toBe('');
  });
  test('ambas funciones se exportan desde el core', () => {
    expect(typeof core.extraerCifrasTablas).toBe('function');
    expect(typeof core.bloqueCifrasVerificadas).toBe('function');
  });
});
