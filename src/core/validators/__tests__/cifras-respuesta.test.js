'use strict';

const { verificarCifras, extraerNumeros } = require('../cifras-respuesta');

const CONTEXTO = [
  'Boletin SE 21-2025: dengue acumulado 18,500 casos; EDA 250,047 episodios.',
  'Boletin SE 22-2025: dengue acumulado 18,663 casos (15,853 sin signos de alarma).',
  'Clima: temperatura promedio 24.3 C, humedad 78.5 %, precipitacion 12.4 mm.',
  'Tendencia: 1,250 casos en la semana 5; 2.5 millones de habitantes expuestos.',
];

describe('extraerNumeros', () => {
  test('miles, decimales y lecturas ambiguas', () => {
    const t = (s) => extraerNumeros(s).map((n) => n.candidatos.map((c) => c.valor));
    expect(t('casos 24,552,263')).toEqual([[24552263]]);
    expect(t('casos 24.552.263')).toEqual([[24552263]]);
    expect(t('1.250,5')).toEqual([[1250.5]]);
    expect(t('1,250.5')).toEqual([[1250.5]]);
    expect(t('12,5')).toEqual([[12.5]]);
    expect(t('1,250')).toEqual([[1250, 1.25]]);       // ambiguo: ambas lecturas
    expect(t('0,250')).toEqual([[0.25]]);             // 0 inicial: decimal
    expect(t('18663')).toEqual([[18663]]);
  });

  test('sufijos mil / millones / %', () => {
    const [mil] = extraerNumeros('unos 18,7 mil casos');
    expect(mil.candidatos[0].valor).toBeCloseTo(18700);
    expect(mil.texto).toBe('18,7 mil');
    const [mill] = extraerNumeros('2,5 millones');
    expect(mill.candidatos[0].valor).toBeCloseTo(2500000);
    const [pct] = extraerNumeros('subio 12 %');
    expect(pct.porcentaje).toBe(true);
    expect(pct.texto).toBe('12 %');
    expect(extraerNumeros('subio 12%')[0].texto).toBe('12%');
  });

  test('ignora números pegados a letras', () => {
    expect(extraerNumeros('H1N1 y SE22 y CIE-10 y COVID19')).toEqual([]);
  });

  test('marca años pero no "2025 casos"', () => {
    expect(extraerNumeros('en 2025')[0].anio).toBe(true);
    expect(extraerNumeros('2025 casos')[0].anio).toBe(false);
    expect(extraerNumeros('2,025')[0].anio).toBe(false);
  });

  test('entradas no string', () => {
    expect(extraerNumeros(null)).toEqual([]);
    expect(extraerNumeros(undefined)).toEqual([]);
    expect(extraerNumeros(42)[0].candidatos[0].valor).toBe(42);
  });
});

describe('verificarCifras', () => {
  test('cifras del contexto: sin advertencia', () => {
    const r = verificarCifras('Hubo 18,663 casos de dengue acumulados; 15,853 sin signos de alarma.', { contexto: CONTEXTO });
    expect(r.advertencia_cifras).toBeNull();
    expect(r.sin_respaldo).toEqual([]);
    expect(r.revisadas).toBe(2);
  });

  test('cifra inventada: advertencia con la cifra', () => {
    const r = verificarCifras('Hubo 19,420 casos de dengue.', { contexto: CONTEXTO });
    expect(r.sin_respaldo).toEqual([{ texto: '19,420', valor: 19420 }]);
    expect(r.advertencia_cifras).toMatch(/19,420/);
    expect(r.advertencia_cifras).toMatch(/Verifícalas/);
  });

  test('redondeo con decimales y con "mil"', () => {
    expect(verificarCifras('Temperatura de 24,3 C y humedad 78,5 %.', { contexto: CONTEXTO }).advertencia_cifras).toBeNull();
    expect(verificarCifras('Unos 18,7 mil casos.', { contexto: CONTEXTO }).advertencia_cifras).toBeNull();
    expect(verificarCifras('Unos 25 mil casos.', { contexto: CONTEXTO }).advertencia_cifras).not.toBeNull();
    expect(verificarCifras('Cerca de 2,5 millones expuestos.', { contexto: CONTEXTO }).advertencia_cifras).toBeNull();
    expect(verificarCifras('Humedad de 79 %.', { contexto: CONTEXTO }).advertencia_cifras).toBeNull();      // 78.5 redondeado
    expect(verificarCifras('Humedad de 77 %.', { contexto: CONTEXTO }).advertencia_cifras).not.toBeNull(); // fuera del redondeo
  });

  test('lectura ambigua "1,250": basta que una coincida', () => {
    expect(verificarCifras('Hubo 1,250 casos.', { contexto: CONTEXTO }).advertencia_cifras).toBeNull();
    expect(verificarCifras('Hubo 1.250 casos.', { contexto: CONTEXTO }).advertencia_cifras).toBeNull();
    expect(verificarCifras('Hubo 1,260 casos.', { contexto: CONTEXTO }).advertencia_cifras).not.toBeNull();
  });

  test('enteros < 100, años y fechas no se revisan', () => {
    const r = verificarCifras('En la semana 22 de 2025 hubo 3 departamentos en alerta, el 7 de octubre de 2026.', { contexto: [] });
    expect(r.revisadas).toBe(0);
    expect(r.advertencia_cifras).toBeNull();
  });

  test('"2025 casos" sí se revisa', () => {
    expect(verificarCifras('Se notificaron 2025 casos.', { contexto: ['dato: 18,663 casos'] }).advertencia_cifras).not.toBeNull();
  });

  test('minimoEntero configurable', () => {
    const r = verificarCifras('Hubo 57 casos.', { contexto: CONTEXTO, minimoEntero: 10 });
    expect(r.sin_respaldo).toHaveLength(1);
  });

  test('derivados: operandos en la respuesta', () => {
    const resp = 'Pasó de 18,500 a 18,663 casos: un aumento de 163 casos (0,9 %).';
    const r = verificarCifras(resp, { contexto: CONTEXTO });
    expect(r.sin_respaldo).toEqual([]);
    // sin operandos en la respuesta, la diferencia NO se acepta (evita coincidencias por azar)
    const solo = verificarCifras('Hubo un aumento de 163 casos.', { contexto: CONTEXTO });
    expect(solo.sin_respaldo).toHaveLength(1);
    // y con permitirDerivados=false tampoco
    const sin = verificarCifras(resp, { contexto: CONTEXTO, permitirDerivados: false });
    expect(sin.sin_respaldo.map((s) => s.texto)).toEqual(['163', '0,9 %']);
  });

  test('derivados: suma, promedio de dos y proporción %', () => {
    const ctx = ['A: 1,000 casos', 'B: 3,000 casos'];
    expect(verificarCifras('De 1,000 y 3,000 casos, en total 4,000 casos.', { contexto: ctx }).sin_respaldo).toEqual([]);
    expect(verificarCifras('Entre 1,000 y 3,000 casos, un promedio de 2,000 casos.', { contexto: ctx }).sin_respaldo).toEqual([]);
    expect(verificarCifras('Con 1,000 de 3,000 casos, el 33,3 %.', { contexto: ctx }).sin_respaldo).toEqual([]);
    expect(verificarCifras('Con 1,000 y 3,000 casos, un 200 % más.', { contexto: ctx }).sin_respaldo).toEqual([]);
    expect(verificarCifras('Con 1,000 y 3,000 casos, un 50 % más.', { contexto: ctx }).sin_respaldo).toHaveLength(1);
  });

  test('derivados: total = suma de varias categorías (caso real SE 22-2025)', () => {
    const ctx = ['Sin signos de alarma: 29,757 casos. Con signos de alarma: 4,000. Dengue grave: 122.'];
    const ok = verificarCifras('Sin alarma 29,757, con alarma 4,000 y grave 122: total de 33,879 casos.', { contexto: ctx });
    expect(ok.sin_respaldo).toEqual([]);
    // un total que NO es la suma sigue marcado
    const mal = verificarCifras('Sin alarma 29,757, con alarma 4,000 y grave 122: total de 34,328 casos.', { contexto: ctx });
    expect(mal.sin_respaldo.map((s) => s.texto)).toEqual(['34,328']);
    // la suma sin los sumandos en la respuesta tampoco se acepta
    expect(verificarCifras('Total de 33,879 casos.', { contexto: ctx }).sin_respaldo).toHaveLength(1);
  });

  test('derivados: cálculo redondeado y un total validado sirve de operando (caso real SE 15 → SE 22)', () => {
    const ctx = ['SE 22: sin alarma 29,757; con alarma 4,000; grave 122.', 'SE 15-2025: acumulado 29,070 casos.'];
    const resp = 'Total 33,879 casos (29,757 + 4,000 + 122). En la SE 15 eran 29,070: un aumento de aproximadamente 4,800 casos.';
    expect(verificarCifras(resp, { contexto: ctx }).sin_respaldo).toEqual([]);
    // un aumento que no corresponde sigue marcado (4,809 vs 5,500)
    const mal = verificarCifras(resp.replace('4,800', '5,500'), { contexto: ctx });
    expect(mal.sin_respaldo.map((s) => s.texto)).toEqual(['5,500']);
  });

  test('espacio como separador de miles ("9 891"), en la respuesta y en el contexto', () => {
    const v = (s) => extraerNumeros(s).map((n) => n.candidatos[0].valor);
    expect(v('9 891 casos; 3 726 y 6 165')).toEqual([9891, 3726, 6165]);
    expect(v('1 234,5')).toEqual([1234.5]);
    expect(v('2025 120 casos')).toEqual([2025, 120]);   // no une un año con otra cifra
    // contexto con espacios, respuesta con comas
    expect(verificarCifras('Acumulado: 34,328 casos.', { contexto: ['dengue acumulado 34 328 casos'] }).advertencia_cifras).toBeNull();
    // contexto con comas, respuesta con espacios (caso real: el modelo escribió "9 891")
    const ctx = ['SE 5-2025: 9,891 casos (3,726 confirmados y 6,165 probables), 11 defunciones'];
    expect(verificarCifras('Se notificaron 9 891 casos (3 726 confirmados y 6 165 probables).', { contexto: ctx }).sin_respaldo).toEqual([]);
    // una cifra inventada con espacios sigue marcada
    expect(verificarCifras('Se notificaron 9 999 casos.', { contexto: ctx }).sin_respaldo.map((s) => s.texto)).toEqual(['9 999']);
  });

  test('"SE 22 100 casos": si la unión no calza se prueban las partes sueltas', () => {
    expect(verificarCifras('En la SE 22 100 casos nuevos.', { contexto: ['100 casos nuevos'] }).sin_respaldo).toEqual([]);
    expect(verificarCifras('En la SE 22 100 casos nuevos.', { contexto: [] }).sin_respaldo.map((s) => s.texto)).toEqual(['22 100']);
  });

  test('cifrasValidas y metadatos explícitos', () => {
    const r = verificarCifras('Hubo 4,321 casos en 12,000 notificaciones.', { cifrasValidas: [4321], metadatos: [12000] });
    expect(r.advertencia_cifras).toBeNull();
    expect(verificarCifras('Hubo 4,322 casos.', { cifrasValidas: [4321] }).advertencia_cifras).not.toBeNull();
    expect(verificarCifras('Hubo 4,321 casos.', { cifrasValidas: ['4321', 'x', null] }).advertencia_cifras).toBeNull();
  });

  test('contexto como texto único, vacío o ausente', () => {
    expect(verificarCifras('Hubo 4,321 casos.', { contexto: 'dato: 4321' }).advertencia_cifras).toBeNull();
    expect(verificarCifras('Hubo 4,321 casos.', {}).advertencia_cifras).not.toBeNull();
    expect(verificarCifras('Hubo 4,321 casos.').sin_respaldo).toHaveLength(1);
  });

  test('respuesta vacía o no string: sin advertencia', () => {
    for (const x of ['', null, undefined, {}]) {
      const r = verificarCifras(x, { contexto: CONTEXTO });
      expect(r).toEqual({ revisadas: 0, sin_respaldo: [], advertencia_cifras: null });
    }
  });

  test('no repite la misma cifra y resume si hay muchas', () => {
    const r = verificarCifras('Hubo 9,001 casos y otra vez 9,001 casos.', { contexto: [] });
    expect(r.sin_respaldo).toHaveLength(1);
    const muchas = verificarCifras('1,001 1,002 1,003 1,004 1,005 1,006 1,007', { contexto: [] });
    expect(muchas.sin_respaldo).toHaveLength(7);
    expect(muchas.advertencia_cifras).toMatch(/y 2 más/);
  });

  test('el cero no se usa como operando', () => {
    const r = verificarCifras('Pasó de 0 a 18,663 casos, un aumento de 18,663 casos.', { contexto: CONTEXTO });
    expect(r.sin_respaldo).toEqual([]);
  });
});
