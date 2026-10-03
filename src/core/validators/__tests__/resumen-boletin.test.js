// Tests — validators/resumen-boletin.js
const { validarResumenBoletin } = require('../resumen-boletin');

describe('validarResumenBoletin', () => {
  test('valida resumen correcto', () => {
    const output = 'SEMANA EPIDEMIOLOGICA: 20\nDengue: 500 casos...';
    const r = validarResumenBoletin(output, 'gemini', 20);
    expect(r.resumen).toContain('SEMANA EPIDEMIOLOGICA: 20');
  });

  test('acepta variante con tilde', () => {
    const output = 'SEMANA EPIDEMIOLÓGICA: 15\nEDA: 200 casos...';
    const r = validarResumenBoletin(output, 'gemini', 15);
    expect(r.resumen).toBeTruthy();
  });

  test('lanza error si output es vacío', () => {
    expect(() => validarResumenBoletin('', 'gemini', 20)).toThrow('resumen valido');
  });

  test('lanza error si output es null', () => {
    expect(() => validarResumenBoletin(null, 'gemini', 20)).toThrow('resumen valido');
  });

  test('lanza error si falta línea de SE', () => {
    expect(() => validarResumenBoletin('Solo texto sin semana', 'gemini', 20))
      .toThrow('SEMANA EPIDEMIOLOGICA');
  });

  test('incluye nombre de modelo en error', () => {
    expect(() => validarResumenBoletin('', 'claude', 20)).toThrow('claude');
  });
});

// ─────────────────────────────────────────────────────────
// Semana esperada y cifras (marcador [CIFRAS: ...])
// ─────────────────────────────────────────────────────────
const { detectarInconsistenciasCifras } = require('../resumen-boletin');

// Acumulados reales del boletín SE 9 de 2025 (los dos modelos coincidieron en ellos).
const RESUMEN_SE9 =
  'SEMANA EPIDEMIOLOGICA: 9\nDengue: 17 331 casos.\n' +
  '[CIFRAS: dengue_total=17331; dengue_defunciones=22; ira_total=223747; ira_neumonias=3128; eda_total=222649]';

const resumenSe10 = cifras => `SEMANA EPIDEMIOLOGICA: 10\nDengue...\n[CIFRAS: ${cifras}]`;
const previoSe9 = { semanaPrevia: 9, resumenPrevio: RESUMEN_SE9 };

describe('validarResumenBoletin — semana esperada', () => {
  test('rechaza si la línea de semana no coincide con el boletín procesado', () => {
    const fn = () => validarResumenBoletin('SEMANA EPIDEMIOLOGICA: 9\nx', 'gemini', 10);
    expect(fn).toThrow('dice 9 pero se está procesando la SE 10');
  });

  test('el error de inconsistencia trae código y lista', () => {
    try {
      validarResumenBoletin('SEMANA EPIDEMIOLOGICA: 9\nx', 'gemini', 10);
      throw new Error('debía fallar');
    } catch (e) {
      expect(e.codigo).toBe('RESUMEN_INCONSISTENTE');
      expect(e.inconsistencias).toHaveLength(1);
      expect(e.message).toContain('gemini');
    }
  });

  test('acepta la semana esperada como texto numérico', () => {
    expect(() => validarResumenBoletin('SEMANA EPIDEMIOLOGICA: 10\nx', 'g', '10')).not.toThrow();
  });

  test('sin semana esperada no compara', () => {
    expect(() => validarResumenBoletin('SEMANA EPIDEMIOLOGICA: 10\nx', 'g')).not.toThrow();
    expect(() => validarResumenBoletin('SEMANA EPIDEMIOLOGICA: 10\nx', 'g', null)).not.toThrow();
  });
});

describe('validarResumenBoletin — marcador de cifras', () => {
  test('sin marcador: pasa con advertencia (compatibilidad con el prompt actual)', () => {
    const r = validarResumenBoletin('SEMANA EPIDEMIOLOGICA: 10\nx', 'g', 10);
    expect(r.cifras).toBeNull();
    expect(r.advertencias[0]).toContain('[CIFRAS');
  });

  test('sin marcador y exigirCifras: rechaza', () => {
    expect(() => validarResumenBoletin('SEMANA EPIDEMIOLOGICA: 10\nx', 'g', 10, { exigirCifras: true }))
      .toThrow('falta la línea final [CIFRAS');
  });

  test('marcador con pares inválidos: rechaza', () => {
    expect(() => validarResumenBoletin(resumenSe10('dengue_total=18 663'), 'g', 10))
      .toThrow('pares inválidos');
  });

  test('devuelve las cifras leídas y el resumen completo (con marcador)', () => {
    const r = validarResumenBoletin(resumenSe10('dengue_total=18663'), 'g', 10);
    expect(r.cifras).toEqual({ dengue_total: 18663 });
    expect(r.resumen).toContain('[CIFRAS: dengue_total=18663]');
    expect(r.advertencias).toEqual([]);
  });
});

describe('validarResumenBoletin — sumas de desgloses (SE 10 de 2025)', () => {
  test('desglose correcto: 15 853 + 2 601 + 209 = 18 663', () => {
    const r = validarResumenBoletin(
      resumenSe10('dengue_total=18663; dengue_sin_alarma=15853; dengue_con_alarma=2601; dengue_graves=209'), 'g', 10);
    expect(r.cifras.dengue_total).toBe(18663);
  });

  test('corrida A: 15 853 + 2 609 + 209 = 18 671 ≠ 18 663', () => {
    expect(() => validarResumenBoletin(
      resumenSe10('dengue_total=18663; dengue_sin_alarma=15853; dengue_con_alarma=2609; dengue_graves=209'), 'g', 10))
      .toThrow('suman 18 671 y el total declarado es 18 663');
  });

  test('corrida C: 15 853 + 2 739 + 14 = 18 606 ≠ 18 663', () => {
    expect(() => validarResumenBoletin(
      resumenSe10('dengue_total=18663; dengue_sin_alarma=15853; dengue_con_alarma=2739; dengue_graves=14'), 'g', 10))
      .toThrow('suman 18 606');
  });

  test('EDA: acuosas + disentéricas (SE 9: 219 269 + 3 380 = 222 649)', () => {
    expect(() => validarResumenBoletin(
      'SEMANA EPIDEMIOLOGICA: 9\n[CIFRAS: eda_total=222649; eda_acuosas=219269; eda_disentericas=3380]', 'g', 9))
      .not.toThrow();
    expect(() => validarResumenBoletin(
      'SEMANA EPIDEMIOLOGICA: 9\n[CIFRAS: eda_total=222649; eda_acuosas=219269; eda_disentericas=3300]', 'g', 9))
      .toThrow('EDA');
  });

  test('desglose incompleto no se evalúa', () => {
    expect(() => validarResumenBoletin(
      resumenSe10('dengue_total=18663; dengue_sin_alarma=15853'), 'g', 10)).not.toThrow();
  });
});

describe('validarResumenBoletin — coherencia entre semanas (SE 9 → SE 10)', () => {
  test('SE 10 coherente con la SE 9: pasa sin advertencias', () => {
    const r = validarResumenBoletin(
      resumenSe10('dengue_total=18663; dengue_defunciones=25; ira_total=249576; ira_neumonias=3506; eda_total=250047'),
      'g', 10, previoSe9);
    expect(r.advertencias).toEqual([]);
  });

  test('corrida B: dengue 63 811 tras 17 331 en la semana anterior se rechaza', () => {
    expect(() => validarResumenBoletin(resumenSe10('dengue_total=63811'), 'g', 10, previoSe9))
      .toThrow(/dengue_total: creció 46 480 entre la SE 9 y la SE 10/);
  });

  test('un acumulado que baja se rechaza', () => {
    expect(() => validarResumenBoletin(resumenSe10('ira_neumonias=1228'), 'g', 10, previoSe9))
      .toThrow('ira_neumonias: bajó de 3 128');
  });

  test('una baja dentro de la tolerancia (corrección tardía del boletín) se acepta', () => {
    // 17 331 → 17 200 es −0,8 %
    expect(() => validarResumenBoletin(resumenSe10('dengue_total=17200'), 'g', 10, previoSe9)).not.toThrow();
  });

  test('las defunciones no tienen tope de crecimiento, solo no bajar', () => {
    expect(() => validarResumenBoletin(resumenSe10('dengue_defunciones=71'), 'g', 10, previoSe9)).not.toThrow();
    expect(() => validarResumenBoletin(resumenSe10('dengue_defunciones=5'), 'g', 10, previoSe9))
      .toThrow('dengue_defunciones: bajó');
  });

  test('salto de varias semanas: SE 2 → SE 9 de 2025 (dengue 3 246 → 17 331) es razonable', () => {
    const previo = { semanaPrevia: 2, resumenPrevio: 'SEMANA EPIDEMIOLOGICA: 2\n[CIFRAS: dengue_total=3246; ira_total=61623]' };
    expect(() => validarResumenBoletin(RESUMEN_SE9, 'g', 9, previo)).not.toThrow();
  });

  test('sin resumen previo no compara entre semanas', () => {
    expect(() => validarResumenBoletin(resumenSe10('dengue_total=63811'), 'g', 10)).not.toThrow();
    expect(() => validarResumenBoletin(resumenSe10('dengue_total=63811'), 'g', 10, { resumenPrevio: '  ' }))
      .not.toThrow();
  });

  test('resumen previo sin marcador: advertencia y no compara', () => {
    const r = validarResumenBoletin(resumenSe10('dengue_total=63811'), 'g', 10,
      { semanaPrevia: 9, resumenPrevio: 'SEMANA EPIDEMIOLOGICA: 9\nsin cifras' });
    expect(r.advertencias[0]).toContain('SE 9');
  });

  test('semanaPrevia null o no anterior: no compara', () => {
    expect(() => validarResumenBoletin(resumenSe10('dengue_total=63811'), 'g', 10,
      { semanaPrevia: null, resumenPrevio: RESUMEN_SE9 })).not.toThrow();
    expect(() => validarResumenBoletin(resumenSe10('dengue_total=63811'), 'g', 10,
      { semanaPrevia: 10, resumenPrevio: RESUMEN_SE9 })).not.toThrow();
  });

  test('acumula varias inconsistencias en un solo error', () => {
    try {
      validarResumenBoletin(
        'SEMANA EPIDEMIOLOGICA: 9\n[CIFRAS: dengue_total=63811; dengue_sin_alarma=1; dengue_con_alarma=1; dengue_graves=1]',
        'g', 10, previoSe9);
      throw new Error('debía fallar');
    } catch (e) {
      expect(e.inconsistencias.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('detectarInconsistenciasCifras', () => {
  test('el factor de crecimiento se puede ajustar', () => {
    const actual = { dengue_total: 30000 };
    const previo = { dengue_total: 17331 };
    const base = { semanaActual: 10, semanaPrevia: 9 };
    expect(detectarInconsistenciasCifras(actual, previo, base)).toHaveLength(1);
    expect(detectarInconsistenciasCifras(actual, previo, { ...base, factorCrecimiento: 10 })).toHaveLength(0);
  });

  test('un factor undefined no pisa el valor por defecto', () => {
    const r = detectarInconsistenciasCifras({ dengue_total: 63811 }, { dengue_total: 17331 },
      { semanaActual: 10, semanaPrevia: 9, factorCrecimiento: undefined });
    expect(r).toHaveLength(1);
  });

  test('con la semana previa < 2 no aplica el tope (promedio poco fiable) pero sí la regla de no bajar', () => {
    const r = detectarInconsistenciasCifras({ dengue_total: 5000 }, { dengue_total: 100 },
      { semanaActual: 2, semanaPrevia: 1 });
    expect(r).toEqual([]);
    const r2 = detectarInconsistenciasCifras({ dengue_total: 10 }, { dengue_total: 100 },
      { semanaActual: 2, semanaPrevia: 1 });
    expect(r2).toHaveLength(1);
  });

  test('sin cifras comparables devuelve vacío', () => {
    expect(detectarInconsistenciasCifras({}, {}, { semanaActual: 10, semanaPrevia: 9 })).toEqual([]);
    expect(detectarInconsistenciasCifras({ dengue_total: 1 }, null, {})).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────
// Series adicionales (SE 9–12 de 2025): sarampión, PFA, ofidismo, muerte materna directa
// ─────────────────────────────────────────────────────────
describe('validarResumenBoletin — series adicionales', () => {
  const marca = (se, c) => `SEMANA EPIDEMIOLOGICA: ${se}\n[CIFRAS: ${Object.entries(c).map(([k, v]) => `${k}=${v}`).join('; ')}]`;
  const conPrevio = (semPrev, cPrev) => ({ semanaPrevia: semPrev, resumenPrevio: marca(semPrev, cPrev) });

  test('sarampión y PFA reales SE 9 → 10 → 11 → 12 pasan', () => {
    const s = {
      9: { sarampion_notificados: 69, pfa_total: 13 },
      10: { sarampion_notificados: 76, pfa_total: 14 },
      11: { sarampion_notificados: 83, pfa_total: 17 },
      12: { sarampion_notificados: 89, pfa_total: 20 },
    };
    for (const se of [10, 11, 12]) {
      expect(() => validarResumenBoletin(marca(se, s[se]), 'g', se, conPrevio(se - 1, s[se - 1]))).not.toThrow();
    }
  });

  test('ofidismo real 497 → 545 → 584 pasa', () => {
    expect(() => validarResumenBoletin(marca(11, { ofidismo_total: 545 }), 'g', 11, conPrevio(10, { ofidismo_total: 497 })))
      .not.toThrow();
    expect(() => validarResumenBoletin(marca(12, { ofidismo_total: 584 }), 'g', 12, conPrevio(11, { ofidismo_total: 545 })))
      .not.toThrow();
  });

  test('muerte materna directa: 15 (SE 9) → 29 (SE 10, columna equivocada) se rechaza', () => {
    expect(() => validarResumenBoletin(marca(10, { muerte_materna_directa: 29 }), 'g', 10,
      conPrevio(9, { muerte_materna_directa: 15 }))).toThrow('muerte_materna_directa: creció 14');
  });

  test('muerte materna directa: 15 → 17 → 18 → 21 pasa', () => {
    expect(() => validarResumenBoletin(marca(10, { muerte_materna_directa: 17 }), 'g', 10, conPrevio(9, { muerte_materna_directa: 15 }))).not.toThrow();
    expect(() => validarResumenBoletin(marca(11, { muerte_materna_directa: 18 }), 'g', 11, conPrevio(10, { muerte_materna_directa: 17 }))).not.toThrow();
    expect(() => validarResumenBoletin(marca(12, { muerte_materna_directa: 21 }), 'g', 12, conPrevio(11, { muerte_materna_directa: 18 }))).not.toThrow();
  });

  test('un acumulado de estas series que baja se rechaza (PFA 17 → 14)', () => {
    expect(() => validarResumenBoletin(marca(12, { pfa_total: 14 }), 'g', 12, conPrevio(11, { pfa_total: 17 })))
      .toThrow('pfa_total: bajó');
  });

  test('con conteos chicos (< 10) no se aplica el tope de crecimiento', () => {
    expect(() => validarResumenBoletin(marca(4, { muerte_materna_directa: 8 }), 'g', 4, conPrevio(3, { muerte_materna_directa: 2 })))
      .not.toThrow();
  });
});
