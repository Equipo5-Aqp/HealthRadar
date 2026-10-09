'use strict';

const {
  construirContextoRag,
  construirExclusionBoletines,
  claveBoletin,
  MAX_CARACTERES_BOLETIN,
  MAX_CARACTERES_TOTAL,
} = require('../contexto-rag');

const fila = (anio, semana, resumen, distancia = 0.2) => ({ anio, semana_epidemiologica: semana, resumen, distancia });

describe('claveBoletin', () => {
  test('anio*100 + semana', () => {
    expect(claveBoletin(2025, 9)).toBe(202509);
    expect(claveBoletin('2025', '10')).toBe(202510);
  });
  test('valores inválidos devuelven null', () => {
    expect(claveBoletin(null, 9)).toBeNull();
    expect(claveBoletin(2025, undefined)).toBeNull();
    expect(claveBoletin(2025, '')).toBeNull();
    expect(claveBoletin(2025.5, 9)).toBeNull();
    expect(claveBoletin('abc', 9)).toBeNull();
    expect(claveBoletin([], 9)).toBeNull();
    expect(claveBoletin(true, 9)).toBeNull();
  });
});

describe('construirExclusionBoletines', () => {
  test('arma el literal de arreglo de Postgres sin repetidos', () => {
    const r = construirExclusionBoletines([
      { anio: 2025, semana_epidemiologica: 9 },
      { anio: 2025, semana_epidemiologica: 10 },
      { anio: 2025, semana_epidemiologica: 9 },
    ]);
    expect(r).toBe('{202509,202510}');
  });
  test('sin boletines devuelve arreglo vacío', () => {
    expect(construirExclusionBoletines([])).toBe('{}');
    expect(construirExclusionBoletines(undefined)).toBe('{}');
    expect(construirExclusionBoletines(null)).toBe('{}');
  });
  test('ignora entradas inválidas (p. ej. el marcador _sin_boletines)', () => {
    expect(construirExclusionBoletines([null, { _sin_boletines: true }, { anio: 2025, semana_epidemiologica: 3 }])).toBe('{202503}');
  });
  test('solo contiene dígitos, comas y llaves (apto para ::int[])', () => {
    expect(construirExclusionBoletines([{ anio: "2025'; DROP", semana_epidemiologica: 1 }])).toBe('{}');
  });
});

describe('construirContextoRag', () => {
  test('sin filas: texto vacío (el prompt no cambia)', () => {
    expect(construirContextoRag([])).toEqual({ texto_rag: '', cantidad: 0, boletines: [] });
    expect(construirContextoRag(undefined)).toEqual({ texto_rag: '', cantidad: 0, boletines: [] });
    expect(construirContextoRag(null).cantidad).toBe(0);
  });

  test('da formato a cada boletín en el mismo orden recibido', () => {
    const r = construirContextoRag([fila(2025, 3, 'Dengue sube en Piura.', 0.1), fila(2025, 2, 'IRA estable.', 0.25)]);
    expect(r.cantidad).toBe(2);
    expect(r.texto_rag).toBe('--- Boletin SE 3-2025 ---\nDengue sube en Piura.\n--- Boletin SE 2-2025 ---\nIRA estable.');
    expect(r.boletines).toEqual([
      { anio: 2025, semana: 3, distancia: 0.1 },
      { anio: 2025, semana: 2, distancia: 0.25 },
    ]);
  });

  test('la distancia llega como texto desde Postgres y se convierte a número', () => {
    const r = construirContextoRag([fila('2025', '4', 'Texto.', '0.3123')]);
    expect(r.boletines).toEqual([{ anio: 2025, semana: 4, distancia: 0.3123 }]);
  });

  test('distancia ausente o inválida queda en null', () => {
    const r = construirContextoRag([fila(2025, 1, 'A', null), fila(2025, 2, 'B', ''), fila(2025, 3, 'C', 'x'), { anio: 2025, semana_epidemiologica: 4, resumen: 'D' }]);
    expect(r.boletines.map((b) => b.distancia)).toEqual([null, null, null, null]);
  });

  test('quita el marcador de cifras del resumen', () => {
    const r = construirContextoRag([fila(2025, 5, 'Texto del boletín.\n[CIFRAS: dengue_total=18663; eda_total=250047]')]);
    expect(r.texto_rag).not.toMatch(/CIFRAS|18663/);
    expect(r.texto_rag).toContain('Texto del boletín.');
  });

  test('descarta filas vacías, inválidas o repetidas', () => {
    const r = construirContextoRag([
      null,
      fila(2025, 1, '   '),
      fila(2025, 2, undefined),
      fila(null, 3, 'sin año'),
      fila(2025, 4, 'bueno', 0.1),
      fila(2025, 4, 'repetido', 0.2),
    ]);
    expect(r.cantidad).toBe(1);
    expect(r.texto_rag).toContain('bueno');
    expect(r.texto_rag).not.toContain('repetido');
  });

  test('recorta cada boletín al máximo por defecto con "…"', () => {
    const r = construirContextoRag([fila(2025, 1, 'x'.repeat(MAX_CARACTERES_BOLETIN + 500))]);
    const cuerpo = r.texto_rag.split('\n')[1];
    expect(cuerpo).toHaveLength(MAX_CARACTERES_BOLETIN);
    expect(cuerpo.endsWith('…')).toBe(true);
  });

  test('respeta maxCaracteresBoletin personalizado; valores inválidos usan el defecto', () => {
    expect(construirContextoRag([fila(2025, 1, 'x'.repeat(100))], { maxCaracteresBoletin: 10 }).texto_rag.split('\n')[1]).toHaveLength(10);
    expect(construirContextoRag([fila(2025, 1, 'x'.repeat(100))], { maxCaracteresBoletin: 0 }).texto_rag.split('\n')[1]).toHaveLength(100);
    expect(construirContextoRag([fila(2025, 1, 'x'.repeat(100))], { maxCaracteresBoletin: 'a' }).texto_rag.split('\n')[1]).toHaveLength(100);
  });

  test('tope total: corta cuando el siguiente boletín ya no cabe, pero el primero siempre entra', () => {
    const filas = [1, 2, 3, 4, 5].map((s) => fila(2025, s, 'y'.repeat(1400), 0.1 * s));
    const r = construirContextoRag(filas);
    expect(r.cantidad).toBeLessThan(5);
    expect(r.cantidad).toBeGreaterThanOrEqual(1);
    expect(r.texto_rag.length).toBeLessThanOrEqual(MAX_CARACTERES_TOTAL);
    const una = construirContextoRag([fila(2025, 1, 'z'.repeat(1400))], { maxCaracteresTotal: 50 });
    expect(una.cantidad).toBe(1);
    const dos = construirContextoRag([fila(2025, 1, 'a'.repeat(30)), fila(2025, 2, 'b'.repeat(30))], { maxCaracteresTotal: 80 });
    expect(dos.cantidad).toBe(1);
  });

  test('maxCaracteresTotal inválido usa el defecto', () => {
    expect(construirContextoRag([fila(2025, 1, 'a'), fila(2025, 2, 'b')], { maxCaracteresTotal: -1 }).cantidad).toBe(2);
  });

  test('no filtra el vector ni otros campos de la fila', () => {
    const r = construirContextoRag([{ ...fila(2025, 1, 'Resumen.'), embedding: '[0.1,0.2]', url_boletin: 'http://x' }]);
    expect(JSON.stringify(r)).not.toMatch(/0\.1,0\.2|http:\/\/x/);
  });
});
