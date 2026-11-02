'use strict';

const { armarTextoTendenciaBoletines, SEMANAS_POR_DEFECTO } = require('../tendencia-boletines');
const { detectarEnfermedad } = require('../../parsers/enfermedad');
const { armarTextoTendencia } = require('../tendencia');

const resumen = (d, e, i, n) => `Resumen.\n[CIFRAS: dengue_total=${d}; eda_total=${e}; ira_total=${i}; ira_neumonias=${n}]`;

// Semanas 10..18 de 2025; dengue suma 100 por semana, EDA 1000, IRA 2000, neumonías 50.
function serie(desde = 10, hasta = 18, anio = 2025) {
  const out = [];
  for (let s = desde; s <= hasta; s++) {
    const k = s - desde + 1;
    out.push({ anio, semana_epidemiologica: s, resumen: resumen(5000 + 100 * k, 90000 + 1000 * k, 200000 + 2000 * k, 4000 + 50 * k) });
  }
  return out;
}
const TODAS = detectarEnfermedad('como estamos');
const SOLO_DENGUE = detectarEnfermedad('dengue');
const PERIODO_2025 = { anio: 2025, semana_desde: 1, semana_hasta: 53, criterio_usado: 'anio completo: 2025' };

describe('armarTextoTendenciaBoletines', () => {
  test('arma las últimas 6 semanas con el mismo formato "SE n-año: N casos"', () => {
    const t = armarTextoTendenciaBoletines(serie(), PERIODO_2025, SOLO_DENGUE);
    const lineas = t.split('\n').filter(l => l.startsWith('SE '));
    expect(lineas).toEqual([
      'SE 13-2025: 100 casos', 'SE 14-2025: 100 casos', 'SE 15-2025: 100 casos',
      'SE 16-2025: 100 casos', 'SE 17-2025: 100 casos', 'SE 18-2025: 100 casos',
    ]);
    expect(t).toMatch(/^Tendencia historica de casos de Dengue a nivel nacional/);
    expect(SEMANAS_POR_DEFECTO).toBe(6);
  });

  test('el encabezado empieza igual que el de Postgres, para que el prompt lo reconozca como tendencia', () => {
    const deBoletines = armarTextoTendenciaBoletines(serie(), PERIODO_2025, SOLO_DENGUE);
    const dePostgres = armarTextoTendencia(
      { activar_prediccion: true, nivel_agregacion: 'nacional', incluir_dengue: true },
      [{ enfermedad: 'dengue', anio: 2024, semana: 1, total_casos: 5 }]
    );
    expect(deBoletines.startsWith('Tendencia historica de casos de Dengue')).toBe(true);
    expect(dePostgres.startsWith('Tendencia historica de casos de Dengue')).toBe(true);
  });

  test('aclara que es nacional y de dónde salen los casos (no se inventan por departamento)', () => {
    const t = armarTextoTendenciaBoletines(serie(), PERIODO_2025, SOLO_DENGUE);
    expect(t).toMatch(/nivel nacional/);
    expect(t).toMatch(/no traen cifras por departamento/);
    expect(t).toMatch(/diferencia entre los acumulados/);
  });

  test('sin enfermedad específica arma un bloque por fuente (dengue, EDA, IRA combinada)', () => {
    const t = armarTextoTendenciaBoletines(serie(), PERIODO_2025, TODAS);
    const encabezados = t.split('\n').filter(l => l.startsWith('Tendencia historica'));
    expect(encabezados).toHaveLength(3);
    expect(encabezados[0]).toMatch(/Dengue/);
    expect(encabezados[1]).toMatch(/EDA/);
    expect(encabezados[2]).toMatch(/IRA \(neumonia \+ no neumonia combinadas\)/);
    expect(t).toMatch(/SE 18-2025: 1000 casos/); // EDA
    expect(t).toMatch(/SE 18-2025: 2000 casos/); // IRA
  });

  test('"neumonía" usa la clave ira_neumonias', () => {
    const t = armarTextoTendenciaBoletines(serie(), PERIODO_2025, detectarEnfermedad('neumonia'));
    expect(t).toMatch(/IRA - Neumonia/);
    expect(t).toMatch(/SE 18-2025: 50 casos/);
  });

  test('solo cuenta hasta el final del periodo consultado', () => {
    const periodo = { anio: 2025, semana_desde: 10, semana_hasta: 14 };
    const t = armarTextoTendenciaBoletines(serie(), periodo, SOLO_DENGUE);
    const lineas = t.split('\n').filter(l => l.startsWith('SE '));
    expect(lineas[lineas.length - 1]).toBe('SE 14-2025: 100 casos');
    expect(lineas.length).toBe(4); // semanas 11..14 (la 10 no tiene boletín previo)
  });

  test('usa anio_hasta cuando el periodo no trae un año específico (ventana por defecto)', () => {
    const periodo = { anio: null, anio_hasta: 2025, semana_hasta: 16, semana_desde: 5 };
    const t = armarTextoTendenciaBoletines(serie(), periodo, SOLO_DENGUE);
    expect(t).toMatch(/SE 16-2025/);
    expect(t).not.toMatch(/SE 17-2025/);
  });

  test('sin periodo conocido usa todo lo que haya', () => {
    expect(armarTextoTendenciaBoletines(serie(), undefined, SOLO_DENGUE)).toMatch(/SE 18-2025/);
    expect(armarTextoTendenciaBoletines(serie(), { anio: 'null' }, SOLO_DENGUE)).toMatch(/SE 18-2025/);
  });

  test('acepta filas con "semana" en lugar de "semana_epidemiologica", y números como texto', () => {
    const filas = serie().map(b => ({ anio: String(b.anio), semana: String(b.semana_epidemiologica), resumen: b.resumen }));
    expect(armarTextoTendenciaBoletines(filas, PERIODO_2025, SOLO_DENGUE)).toMatch(/SE 18-2025: 100 casos/);
  });

  test('menos de 3 semanas calculables → texto vacío (el modelo no recibe tendencia ni escribe riesgo)', () => {
    expect(armarTextoTendenciaBoletines(serie(10, 12), PERIODO_2025, SOLO_DENGUE)).toBe(''); // solo 2 diferencias
    expect(armarTextoTendenciaBoletines(serie(10, 13), PERIODO_2025, SOLO_DENGUE)).not.toBe('');
  });

  test('un hueco de boletines no se rellena: esa semana y la siguiente quedan fuera', () => {
    const base = serie(10, 18).filter(b => b.semana_epidemiologica !== 14);
    const t = armarTextoTendenciaBoletines(base, PERIODO_2025, SOLO_DENGUE);
    const lineas = t.split('\n').filter(l => l.startsWith('SE '));
    expect(lineas.map(l => l.split(':')[0])).toEqual(['SE 11-2025', 'SE 12-2025', 'SE 13-2025', 'SE 16-2025', 'SE 17-2025', 'SE 18-2025']);
  });

  test('un acumulado que baja (corrección) no genera casos negativos', () => {
    const base = serie(10, 18);
    base[4].resumen = resumen(1, 1, 1, 1); // semana 14 con acumulado menor
    const t = armarTextoTendenciaBoletines(base, PERIODO_2025, SOLO_DENGUE);
    expect(t).not.toMatch(/-\d+ casos/);
  });

  test('boletines sin marcador de cifras o con basura se ignoran', () => {
    const base = [...serie(10, 18), { anio: 2025, semana_epidemiologica: 19, resumen: 'sin cifras' },
      null, { anio: 'x', semana_epidemiologica: 1, resumen: resumen(1, 1, 1, 1) }];
    expect(armarTextoTendenciaBoletines(base, PERIODO_2025, SOLO_DENGUE)).toMatch(/SE 18-2025/);
  });

  test('una fuente sin su clave en el marcador no aparece; las demás sí', () => {
    const base = serie().map(b => ({ ...b, resumen: b.resumen.replace(/dengue_total=\d+;\s*/, '') }));
    const t = armarTextoTendenciaBoletines(base, PERIODO_2025, TODAS);
    expect(t).not.toMatch(/de Dengue/);
    expect(t).toMatch(/EDA/);
  });

  test('semana 1: el acumulado del año nuevo se toma tal cual', () => {
    const base = [
      { anio: 2026, semana_epidemiologica: 1, resumen: resumen(300, 1, 1, 1) },
      { anio: 2026, semana_epidemiologica: 2, resumen: resumen(520, 1, 1, 1) },
      { anio: 2026, semana_epidemiologica: 3, resumen: resumen(760, 1, 1, 1) },
    ];
    const t = armarTextoTendenciaBoletines(base, { anio: 2026, semana_hasta: 53 }, SOLO_DENGUE);
    expect(t).toMatch(/SE 1-2026: 300 casos[\s\S]*SE 2-2026: 220 casos[\s\S]*SE 3-2026: 240 casos/);
  });

  test('opciones.semanas cambia cuántas semanas se muestran (mínimo 3)', () => {
    const lineas = o => armarTextoTendenciaBoletines(serie(), PERIODO_2025, SOLO_DENGUE, o).split('\n').filter(l => l.startsWith('SE '));
    expect(lineas({ semanas: 4 })).toHaveLength(4);
    expect(lineas({ semanas: 1 })).toHaveLength(3);
    expect(lineas({ semanas: 'x' })).toHaveLength(6);
  });

  test('periodo posterior al último boletín (2026 con boletines solo de 2025) → sin tendencia ni riesgo', () => {
    expect(armarTextoTendenciaBoletines(serie(), { anio: 2026, semana_desde: 1, semana_hasta: 53 }, SOLO_DENGUE)).toBe('');
    expect(armarTextoTendenciaBoletines(serie(), { anio: null, anio_desde: 2026, anio_hasta: 2027, semana_desde: 1, semana_hasta: 53, rango_anios: true }, SOLO_DENGUE)).toBe('');
  });

  test('semana futura del mismo año (SE 40 con boletines hasta la SE 18) → sin tendencia', () => {
    expect(armarTextoTendenciaBoletines(serie(), { anio: 2025, semana_desde: 40, semana_hasta: 40 }, SOLO_DENGUE)).toBe('');
  });

  // Caso real: SE 13–17 con cifras, SE 18–24 con resumen en el formato anterior (sin [CIFRAS], pendientes de
  // reproceso) y SE 25 con cifras. La pregunta por la SE 22 debe seguir teniendo tendencia (la última calculable).
  test('semanas pendientes de reproceso (resumen sin cifras) no quitan la tendencia si el periodo ya está publicado', () => {
    const base = [];
    for (let s = 13; s <= 17; s++) base.push({ anio: 2025, semana_epidemiologica: s, resumen: resumen(100 * s, 30000 + 500 * s, 1, 1) });
    for (let s = 18; s <= 24; s++) base.push({ anio: 2025, semana_epidemiologica: s, resumen: 'Resumen en el formato anterior, sin cifras.' });
    base.push({ anio: 2025, semana_epidemiologica: 25, resumen: resumen(2500, 42500, 1, 1) });
    const EDA = detectarEnfermedad('Casos de EDA en la SE 22 de 2025');
    const t = armarTextoTendenciaBoletines(base, { anio: 2025, semana_desde: 22, semana_hasta: 22 }, EDA);
    expect(t.split('\n').filter(l => l.startsWith('SE ')).map(l => l.split(':')[0])).toEqual(['SE 14-2025', 'SE 15-2025', 'SE 16-2025', 'SE 17-2025']);
  });

  test('un periodo posterior al último boletín publicado (con o sin cifras) no tiene tendencia', () => {
    const base = serie(10, 18);
    base.push({ anio: 2025, semana_epidemiologica: 19, resumen: 'Resumen sin cifras.' });
    expect(armarTextoTendenciaBoletines(base, { anio: 2025, semana_desde: 19, semana_hasta: 19 }, SOLO_DENGUE)).not.toBe('');
    expect(armarTextoTendenciaBoletines(base, { anio: 2025, semana_desde: 20, semana_hasta: 20 }, SOLO_DENGUE)).toBe('');
  });

  test('el siguiente año al último boletín no tiene tendencia', () => {
    const base = [];
    for (let s = 46; s <= 52; s++) base.push({ anio: 2025, semana_epidemiologica: s, resumen: resumen(100 * s, 1, 1, 1) });
    expect(armarTextoTendenciaBoletines(base, { anio: 2025, semana_desde: 52, semana_hasta: 52 }, SOLO_DENGUE)).toMatch(/SE 52-2025/);
    expect(armarTextoTendenciaBoletines(base, { anio: 2026, semana_desde: 1, semana_hasta: 1 }, SOLO_DENGUE)).toBe('');
  });

  test('los resúmenes vacíos o con texto de relleno no cuentan como boletín publicado', () => {
    const base = [...serie(10, 18), { anio: 2025, semana_epidemiologica: 30, resumen: 'empty' }, { anio: 2025, semana_epidemiologica: 31, resumen: '' }];
    expect(armarTextoTendenciaBoletines(base, { anio: 2025, semana_desde: 30, semana_hasta: 30 }, SOLO_DENGUE)).toBe('');
  });

  test('periodo que sí llega a los boletines (año completo, rango o ventana) → con tendencia', () => {
    expect(armarTextoTendenciaBoletines(serie(), PERIODO_2025, SOLO_DENGUE)).not.toBe('');
    expect(armarTextoTendenciaBoletines(serie(), { anio: null, anio_desde: 2024, anio_hasta: 2025, semana_desde: 1, semana_hasta: 53, rango_anios: true }, SOLO_DENGUE)).not.toBe('');
    expect(armarTextoTendenciaBoletines(serie(), { anio: null, anio_desde: 2025, anio_hasta: 2025, semana_desde: 7, semana_hasta: 18 }, SOLO_DENGUE)).not.toBe('');
  });

  test('pregunta de otra enfermedad (malaria, sarampión, PFA...) → sin tendencia ni riesgo', () => {
    for (const q of ['casos de malaria en 2025', 'sarampión en la SE 29', 'muertes maternas 2025', 'ofidismo', 'parálisis flácida aguda']) {
      expect(armarTextoTendenciaBoletines(serie(), PERIODO_2025, detectarEnfermedad(q))).toBe('');
    }
  });

  test('si además menciona dengue/EDA/IRA, la tendencia es solo de esa enfermedad', () => {
    const t = armarTextoTendenciaBoletines(serie(), PERIODO_2025, detectarEnfermedad('dengue y malaria en 2025'));
    expect(t).toMatch(/de Dengue/);
    expect(t).not.toMatch(/EDA|IRA/);
  });

  test('sin los campos nuevos del detector (llamadas antiguas) se comporta como siempre', () => {
    const antigua = { incluir_dengue: true };
    expect(armarTextoTendenciaBoletines(serie(), PERIODO_2025, antigua)).toMatch(/de Dengue/);
  });

  test('entradas vacías o inválidas devuelven texto vacío sin lanzar', () => {
    expect(armarTextoTendenciaBoletines(undefined, undefined, undefined)).toBe('');
    expect(armarTextoTendenciaBoletines([], PERIODO_2025, TODAS)).toBe('');
    expect(armarTextoTendenciaBoletines(serie(), PERIODO_2025, {})).toBe('');
    expect(armarTextoTendenciaBoletines(serie(), PERIODO_2025, { incluir_ira_no_neumonia: true })).toBe('');
  });
});
