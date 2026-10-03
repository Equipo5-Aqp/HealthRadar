// Tests — parsers/cifras-boletin.js
const { extraerCifras, quitarMarcadorCifras } = require('../cifras-boletin');

describe('extraerCifras', () => {
  test('lee un marcador completo', () => {
    const t = 'SEMANA EPIDEMIOLOGICA: 10\n...\n[CIFRAS: dengue_total=18663; eda_total=250047]';
    expect(extraerCifras(t)).toEqual({
      cifras: { dengue_total: 18663, eda_total: 250047 },
      invalidas: [],
    });
  });

  test('devuelve null si no hay marcador', () => {
    expect(extraerCifras('solo texto')).toBeNull();
  });

  test('devuelve null si no es texto', () => {
    expect(extraerCifras(null)).toBeNull();
    expect(extraerCifras(undefined)).toBeNull();
    expect(extraerCifras(42)).toBeNull();
  });

  test('con varios marcadores usa el último', () => {
    const t = '[CIFRAS: dengue_total=1]\nmás texto\n[CIFRAS: dengue_total=2]';
    expect(extraerCifras(t).cifras).toEqual({ dengue_total: 2 });
  });

  test('es tolerante con mayúsculas del rótulo, espacios y punto y coma final', () => {
    const t = '  [cifras:  dengue_total = 10 ;  eda_total=20 ; ]  ';
    expect(extraerCifras(t)).toEqual({ cifras: { dengue_total: 10, eda_total: 20 }, invalidas: [] });
  });

  test('separa los pares inválidos sin perder los válidos', () => {
    const t = '[CIFRAS: dengue_total=18 663; eda_total=250047; ira_total=abc; sin_igual; Mala-Clave=5; x=]';
    const r = extraerCifras(t);
    expect(r.cifras).toEqual({ eda_total: 250047 });
    expect(r.invalidas).toEqual(['dengue_total=18 663', 'ira_total=abc', 'sin_igual', 'Mala-Clave=5', 'x=']);
  });

  test('un marcador vacío es válido y sin cifras', () => {
    expect(extraerCifras('[CIFRAS: ]')).toEqual({ cifras: {}, invalidas: [] });
  });

  test('ignora un [CIFRAS: ...] escrito a mitad de una línea', () => {
    expect(extraerCifras('el modelo escribió [CIFRAS: dengue_total=1] en medio')).toBeNull();
  });
});

describe('quitarMarcadorCifras', () => {
  test('quita la línea del marcador y los espacios finales', () => {
    const t = 'Dengue: 18 663 casos.\n\n[CIFRAS: dengue_total=18663]\n';
    expect(quitarMarcadorCifras(t)).toBe('Dengue: 18 663 casos.');
  });

  test('deja igual un texto sin marcador', () => {
    expect(quitarMarcadorCifras('sin marcador')).toBe('sin marcador');
  });

  test('devuelve tal cual lo que no es texto', () => {
    expect(quitarMarcadorCifras(null)).toBeNull();
    expect(quitarMarcadorCifras(undefined)).toBeUndefined();
  });
});
