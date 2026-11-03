'use strict';

const {
  calcularRiesgoPanorama, SEMANAS_POR_TRAMO, UMBRAL_ALTO, UMBRAL_MEDIO, MIN_PROMEDIO_PREVIO,
} = require('../riesgo-panorama');
const { construirPanorama } = require('../panorama');

// Boletín con marcador [CIFRAS] a partir de un objeto de acumulados.
const boletin = (anio, semana, cifras) => ({
  anio,
  semana,
  resumen: `SEMANA EPIDEMIOLOGICA: ${semana}\nTexto.\n\n[CIFRAS: ${Object.entries(cifras).map(([k, v]) => `${k}=${v}`).join('; ')}]`,
});

// Serie de acumulados a partir de casos semanales (desde la SE `desde` del año, con base `base`).
function serie(anio, desde, casosSemanales, clave, base = 0) {
  let acum = base;
  return casosSemanales.map((c, i) => {
    acum += c;
    return boletin(anio, desde + i, { [clave]: acum });
  });
}

// 6 semanas: 3 previas y 3 recientes con la variación dada.
const casos6 = (previa, reciente) => [previa, previa, previa, reciente, reciente, reciente];

describe('calcularRiesgoPanorama · nivel por variación', () => {
  test('constantes de la regla', () => {
    expect(SEMANAS_POR_TRAMO).toBe(3);
    expect(UMBRAL_ALTO).toBe(0.20);
    expect(UMBRAL_MEDIO).toBe(0.05);
    expect(MIN_PROMEDIO_PREVIO).toBe(10);
  });

  // La SE 1 trae el acumulado de la primera semana (base 1000); el resto, la diferencia.
  const conBase = (casos, clave) => [boletin(2025, 10, { [clave]: 1000 }), ...serie(2025, 11, casos, clave, 1000)];

  test.each([
    ['alto', 1000, 1300, 30],
    ['alto', 1000, 1200, 20],   // justo en el umbral
    ['medio', 1000, 1100, 10],
    ['medio', 1000, 1050, 5],   // justo en el umbral
    ['bajo', 1000, 1040, 4],
    ['bajo', 1000, 1000, 0],
    ['bajo', 1000, 700, -30],
  ])('IRA: %s (previas %i, recientes %i → %i %%)', (nivel, previa, reciente, pct) => {
    const r = calcularRiesgoPanorama(conBase(casos6(previa, reciente), 'ira_total'), { anio: 2025, semana: 16 });
    expect(r.nivel).toBe(nivel);
    expect(r.variacion_pct).toBe(pct);
    expect(r.enfermedad).toBe('IRA');
    expect(r.alcance).toBe('nacional');
  });

  test('el detalle dice enfermedad, tendencia, variación y semanas', () => {
    const aumento = calcularRiesgoPanorama(conBase(casos6(1000, 1300), 'eda_total'), { anio: 2025, semana: 16 });
    expect(aumento.detalle).toBe('EDA en aumento (+30 %, SE 14-16 frente a SE 11-13). Nivel nacional.');
    const descenso = calcularRiesgoPanorama(conBase(casos6(1000, 700), 'eda_total'), { anio: 2025, semana: 16 });
    expect(descenso.detalle).toMatch(/^EDA en descenso \(-30 %,/);
    const estable = calcularRiesgoPanorama(conBase(casos6(1000, 1000), 'eda_total'), { anio: 2025, semana: 16 });
    expect(estable.detalle).toMatch(/^EDA estable \(0 %,/);
  });

  test('por_enfermedad trae los promedios de cada tramo', () => {
    const r = calcularRiesgoPanorama(conBase(casos6(1000, 1300), 'eda_total'), { anio: 2025, semana: 16 });
    expect(r.por_enfermedad).toEqual([{
      id: 'eda', nombre: 'EDA', nivel: 'alto', variacion_pct: 30,
      recientes: { semanas: 'SE 14-16', promedio: 1300 },
      previas: { semanas: 'SE 11-13', promedio: 1000 },
    }]);
    expect(r.sin_datos).toEqual(['Dengue', 'IRA']);
  });
});

describe('calcularRiesgoPanorama · varias enfermedades', () => {
  const dos = () => {
    const ira = serie(2025, 11, casos6(1000, 1060), 'ira_total', 1000); // +6 % → medio
    const eda = serie(2025, 11, casos6(1000, 1300), 'eda_total', 1000); // +30 % → alto
    const base = boletin(2025, 10, { ira_total: 1000, eda_total: 1000 });
    return [base, ...ira.map((b, i) => boletin(2025, 11 + i, {
      ira_total: Number(/ira_total=(\d+)/.exec(b.resumen)[1]),
      eda_total: Number(/eda_total=(\d+)/.exec(eda[i].resumen)[1]),
    }))];
  };

  test('gana el nivel más alto', () => {
    const r = calcularRiesgoPanorama(dos(), { anio: 2025, semana: 16 });
    expect(r.nivel).toBe('alto');
    expect(r.enfermedad).toBe('EDA');
    expect(r.por_enfermedad.map(e => e.id)).toEqual(['ira', 'eda']);
  });

  test('empate de nivel: gana la de mayor variación', () => {
    const casosIra = casos6(1000, 1250); // +25 %
    const casosEda = casos6(1000, 1400); // +40 %
    const base = boletin(2025, 10, { ira_total: 0, eda_total: 0 });
    let a = 0; let b = 0;
    const resto = casosIra.map((c, i) => {
      a += c; b += casosEda[i];
      return boletin(2025, 11 + i, { ira_total: a, eda_total: b });
    });
    const r = calcularRiesgoPanorama([base, ...resto], { anio: 2025, semana: 16 });
    expect(r.nivel).toBe('alto');
    expect(r.enfermedad).toBe('EDA');
  });
});

describe('calcularRiesgoPanorama · cuándo NO hay riesgo (null)', () => {
  const ok = () => [boletin(2025, 10, { eda_total: 1000 }), ...serie(2025, 11, casos6(1000, 1300), 'eda_total', 1000)];

  test('menos de 6 semanas calculables', () => {
    expect(calcularRiesgoPanorama(ok().slice(0, 6), { anio: 2025, semana: 15 })).toBeNull();
  });

  test('falta una semana en el medio (reproceso pendiente): semanas no consecutivas', () => {
    const f = ok().filter(b => b.semana !== 13);
    expect(calcularRiesgoPanorama(f, { anio: 2025, semana: 16 })).toBeNull();
  });

  test('un acumulado baja entre boletines (corrección): esa semana no se calcula', () => {
    const f = ok();
    f[4] = boletin(2025, 14, { eda_total: 100 });
    expect(calcularRiesgoPanorama(f, { anio: 2025, semana: 16 })).toBeNull();
  });

  test('el boletín mostrado no trae cifras: la serie no llega a esa semana', () => {
    const f = [...ok(), { anio: 2025, semana: 17, resumen: 'Resumen antiguo sin marcador.' }];
    expect(calcularRiesgoPanorama(f, { anio: 2025, semana: 17 })).toBeNull();
  });

  test('base muy baja (menos de 10 casos por semana): no hay con qué comparar', () => {
    const f = [boletin(2025, 10, { dengue_total: 0 }), ...serie(2025, 11, casos6(5, 50), 'dengue_total')];
    expect(calcularRiesgoPanorama(f, { anio: 2025, semana: 16 })).toBeNull();
  });

  test('entradas inválidas', () => {
    expect(calcularRiesgoPanorama(undefined, { anio: 2025, semana: 16 })).toBeNull();
    expect(calcularRiesgoPanorama(ok(), undefined)).toBeNull();
    expect(calcularRiesgoPanorama(ok(), { anio: 'x', semana: 16 })).toBeNull();
    expect(calcularRiesgoPanorama(ok(), { anio: 2025, semana: null })).toBeNull();
    expect(calcularRiesgoPanorama([null, { anio: 'x', semana: 3, resumen: 'a' }, { anio: 2025, semana: 2 }], { anio: 2025, semana: 16 })).toBeNull();
  });

  test('otras enfermedades del marcador (sarampión, PFA) no generan riesgo', () => {
    const f = [boletin(2025, 10, { sarampion_notificados: 1000 }), ...serie(2025, 11, casos6(1000, 3000), 'sarampion_notificados', 1000)];
    expect(calcularRiesgoPanorama(f, { anio: 2025, semana: 16 })).toBeNull();
  });
});

describe('calcularRiesgoPanorama · tope, orden y año nuevo', () => {
  test('con tope en una semana anterior ignora los boletines posteriores', () => {
    const f = [boletin(2025, 10, { eda_total: 1000 }), ...serie(2025, 11, [1000, 1000, 1000, 1000, 1000, 1000, 5000, 5000], 'eda_total', 1000)];
    const r = calcularRiesgoPanorama(f, { anio: 2025, semana: 16 });
    expect(r.nivel).toBe('bajo');
    const r2 = calcularRiesgoPanorama(f, { anio: 2025, semana: 18 });
    expect(r2.nivel).toBe('alto');
  });

  test('acepta boletines en cualquier orden y la clave semana_epidemiologica', () => {
    const f = [boletin(2025, 10, { eda_total: 1000 }), ...serie(2025, 11, casos6(1000, 1300), 'eda_total', 1000)]
      .map(b => ({ anio: String(b.anio), semana_epidemiologica: String(b.semana), resumen: b.resumen }))
      .reverse();
    expect(calcularRiesgoPanorama(f, { anio: 2025, semana: 16 }).nivel).toBe('alto');
  });

  test('cruza el año: SE 51-52 de 2025 y SE 1-4 de 2026', () => {
    // 2025: acumulado hasta la SE 52; 2026: la SE 1 reinicia el acumulado
    const a2025 = [boletin(2025, 50, { eda_total: 10000 }), boletin(2025, 51, { eda_total: 11000 }), boletin(2025, 52, { eda_total: 12000 })];
    const a2026 = [boletin(2026, 1, { eda_total: 1000 }), boletin(2026, 2, { eda_total: 2300 }), boletin(2026, 3, { eda_total: 3600 }), boletin(2026, 4, { eda_total: 4900 })];
    // semanas: 51: 1000, 52: 1000, 1: 1000, 2: 1300, 3: 1300, 4: 1300 → +30 %
    const r = calcularRiesgoPanorama([...a2025, ...a2026], { anio: 2026, semana: 4 });
    expect(r.nivel).toBe('alto');
    expect(r.por_enfermedad[0].previas.semanas).toBe('SE 51/2025-1/2026');
    expect(r.por_enfermedad[0].recientes.semanas).toBe('SE 2-4');
  });

  test('también cruza desde una SE 53', () => {
    const a = [boletin(2026, 50, { eda_total: 9000 }), boletin(2026, 51, { eda_total: 10000 }), boletin(2026, 52, { eda_total: 11000 }), boletin(2026, 53, { eda_total: 12000 })];
    const b = [boletin(2027, 1, { eda_total: 1300 }), boletin(2027, 2, { eda_total: 2600 }), boletin(2027, 3, { eda_total: 3900 })];
    expect(calcularRiesgoPanorama([...a, ...b], { anio: 2027, semana: 3 }).nivel).toBe('alto');
  });

  test('un salto de año que no es SE 52/53 → SE 1 no es consecutivo', () => {
    const a = [boletin(2025, 38, { eda_total: 10000 }), boletin(2025, 39, { eda_total: 11000 }), boletin(2025, 40, { eda_total: 12000 })];
    const b = [boletin(2026, 1, { eda_total: 1300 }), boletin(2026, 2, { eda_total: 2600 }), boletin(2026, 3, { eda_total: 3900 })];
    expect(calcularRiesgoPanorama([...a, ...b], { anio: 2026, semana: 3 })).toBeNull();
  });
});

// Acumulados reales leídos de la base (boletines 2025, [CIFRAS]) y de los textos de los boletines SE 30–36.
describe('calcularRiesgoPanorama · datos reales de 2025', () => {
  const dengue = { 25: 35792, 26: 35423, 27: 35429, 28: 35160, 29: 34939, 30: 34776, 31: 34652, 32: 34677, 33: 34732, 34: 34713, 35: 34942, 36: 35297 };
  const real = [];
  for (const [s, v] of Object.entries(dengue)) real.push(boletin(2025, Number(s), { dengue_total: v }));

  test('dengue 2025: el acumulado baja varias semanas (reclasificaciones) → sin riesgo de dengue', () => {
    expect(calcularRiesgoPanorama(real, { anio: 2025, semana: 36 })).toBeNull();
  });

  test('IRA y EDA reales SE 25–29: solo 4 semanas calculables → todavía sin riesgo', () => {
    const f = [
      boletin(2025, 25, { ira_total: 874772, eda_total: 627760 }),
      boletin(2025, 26, { ira_total: 925374, eda_total: 653264 }),
      boletin(2025, 27, { ira_total: 971278, eda_total: 676161 }),
      boletin(2025, 28, { ira_total: 1022123, eda_total: 701097 }),
      boletin(2025, 29, { ira_total: 1069177, eda_total: 726561 }),
    ];
    expect(calcularRiesgoPanorama(f, { anio: 2025, semana: 29 })).toBeNull();
  });

  test('IRA y EDA reales SE 25–29 + semanas siguientes simuladas: calcula con las semanas reales y evalúa', () => {
    const f = [
      boletin(2025, 25, { ira_total: 874772, eda_total: 627760 }),
      boletin(2025, 26, { ira_total: 925374, eda_total: 653264 }),
      boletin(2025, 27, { ira_total: 971278, eda_total: 676161 }),
      boletin(2025, 28, { ira_total: 1022123, eda_total: 701097 }),
      boletin(2025, 29, { ira_total: 1069177, eda_total: 726561 }),
      boletin(2025, 30, { ira_total: 1116231, eda_total: 751800 }),
    ];
    const r = calcularRiesgoPanorama(f, { anio: 2025, semana: 30 });
    expect(r).toBeNull(); // 5 semanas calculables (26–30): falta 1 para las 6
    const g = [...f, boletin(2025, 31, { ira_total: 1163285, eda_total: 777000 })];
    const r2 = calcularRiesgoPanorama(g, { anio: 2025, semana: 31 });
    expect(r2).not.toBeNull();
    expect(['bajo', 'medio']).toContain(r2.nivel);
    expect(r2.por_enfermedad.map(e => e.id)).toEqual(['ira', 'eda']);
  });
});

describe('construirPanorama · riesgo (HU2)', () => {
  const filas = [
    ...serie(2025, 11, casos6(1000, 1300), 'eda_total', 1000).reverse(),
    boletin(2025, 10, { eda_total: 1000 }),
  ];

  test('sin filtros: el riesgo se calcula con el boletín más reciente que trae cifras', () => {
    const r = construirPanorama(filas, { anio: 0, semana: 0 });
    expect(r.boletin.semana).toBe(16);
    expect(r.riesgo.nivel).toBe('alto');
    expect(r.riesgo.detalle).toMatch(/^EDA en aumento/);
  });

  test('con año y semana: el riesgo llega hasta ese boletín', () => {
    const r = construirPanorama(filas, { anio: 2025, semana: 15 });
    expect(r.boletin.semana).toBe(15);
    expect(r.riesgo).toBeNull(); // hasta la SE 15 solo hay 5 semanas calculables
  });

  test('sin series suficientes sigue en null y el resto de la respuesta no cambia', () => {
    const r = construirPanorama(filas.slice(-3), { anio: 0, semana: 0 });
    expect(r.ok).toBe(true);
    expect(r.riesgo).toBeNull();
  });
});
