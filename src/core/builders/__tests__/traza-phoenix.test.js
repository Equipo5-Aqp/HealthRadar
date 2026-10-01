// Tests — builders/traza-phoenix.js
const { construirTrazaPhoenix, estimarTokens } = require('../traza-phoenix');

const IDS = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) };
const base = {
  nombre: 'nlq.consulta', entrada: 'casos de dengue en Lima', salida: 'Hay 120 casos.',
  modelo: 'gemini-3.6-flash', inicioMs: Date.UTC(2026, 8, 28, 10, 0, 0), finMs: Date.UTC(2026, 8, 28, 10, 0, 3), ids: IDS,
};
const span = (o) => construirTrazaPhoenix({ ...base, ...o }).data[0];

describe('estimarTokens', () => {
  test('~4 caracteres por token, redondeando hacia arriba', () => {
    expect(estimarTokens('abcd')).toBe(1);
    expect(estimarTokens('abcde')).toBe(2);
    expect(estimarTokens('')).toBe(0);
  });
  test('valores que no son texto dan 0', () => {
    expect(estimarTokens(null)).toBe(0);
    expect(estimarTokens(undefined)).toBe(0);
    expect(estimarTokens(123)).toBe(0);
  });
});

describe('construirTrazaPhoenix', () => {
  test('arma el body { data: [span] } con el formato que exige Phoenix', () => {
    const r = construirTrazaPhoenix(base);
    expect(Object.keys(r)).toEqual(['data']);
    const s = r.data[0];
    expect(s.name).toBe('nlq.consulta');
    expect(s.span_kind).toBe('LLM');
    expect(s.context).toEqual({ trace_id: IDS.traceId, span_id: IDS.spanId });
    expect(s.parent_id).toBeNull();
    expect(s.status_code).toBe('OK');
    expect(s.status_message).toBe('');
    expect(s.start_time).toBe('2026-09-28T10:00:00.000Z');
    expect(s.end_time).toBe('2026-09-28T10:00:03.000Z');
  });

  test('atributos OpenInference y latencia', () => {
    const a = span().attributes;
    expect(a['openinference.span.kind']).toBe('LLM');
    expect(a['input.value']).toBe('casos de dengue en Lima');
    expect(a['output.value']).toBe('Hay 120 casos.');
    expect(a['llm.model_name']).toBe('gemini-3.6-flash');
    expect(a['healthradar.latencia_ms']).toBe(3000);
  });

  test('sin consumo real: estima tokens y lo marca', () => {
    const a = span().attributes;
    expect(a['healthradar.tokens_estimados']).toBe(true);
    expect(a['llm.token_count.prompt']).toBe(estimarTokens(base.entrada));
    expect(a['llm.token_count.completion']).toBe(estimarTokens(base.salida));
    expect(a['llm.token_count.total']).toBe(a['llm.token_count.prompt'] + a['llm.token_count.completion']);
  });

  test('promptChars reemplaza a la entrada para estimar el prompt completo', () => {
    const a = span({ promptChars: 4000 }).attributes;
    expect(a['llm.token_count.prompt']).toBe(1000);
  });

  test('con consumo real: usa esos tokens y no marca estimación', () => {
    const a = span({ tokens: { prompt: 900, completion: 50 } }).attributes;
    expect(a['llm.token_count.prompt']).toBe(900);
    expect(a['llm.token_count.completion']).toBe(50);
    expect(a['llm.token_count.total']).toBe(950);
    expect(a['healthradar.tokens_estimados']).toBe(false);
  });

  test('tokens reales incompletos se ignoran y se estima', () => {
    const a = span({ tokens: { prompt: 900 } }).attributes;
    expect(a['healthradar.tokens_estimados']).toBe(true);
  });

  test('session.id y metadatos con prefijo healthradar.', () => {
    const a = span({ sessionId: 's1', metadatos: { nivel_riesgo: 'alto', agente: 2, nulo: null, indef: undefined } }).attributes;
    expect(a['session.id']).toBe('s1');
    expect(a['healthradar.nivel_riesgo']).toBe('alto');
    expect(a['healthradar.agente']).toBe(2);
    expect('healthradar.nulo' in a).toBe(false);
    expect('healthradar.indef' in a).toBe(false);
  });

  test('sin sessionId no agrega session.id', () => {
    expect('session.id' in span().attributes).toBe(false);
  });

  test('error: status ERROR con mensaje', () => {
    const s = span({ exito: false, error: 'quota excedida', salida: '' });
    expect(s.status_code).toBe('ERROR');
    expect(s.status_message).toBe('quota excedida');
  });

  test('error sin mensaje deja status_message vacío', () => {
    expect(span({ exito: false }).status_message).toBe('');
  });

  test('genera trace_id (32 hex) y span_id (16 hex) distintos si no se inyectan', () => {
    const { ids, ...sinIds } = base;
    const a = construirTrazaPhoenix(sinIds).data[0].context;
    const b = construirTrazaPhoenix(sinIds).data[0].context;
    expect(a.trace_id).toMatch(/^[0-9a-f]{32}$/);
    expect(a.span_id).toMatch(/^[0-9a-f]{16}$/);
    expect(a.trace_id).not.toBe(b.trace_id);
  });

  test('tiempos inválidos: fin nunca antes del inicio, y sin inicio usa el fin', () => {
    const s1 = span({ inicioMs: 5000, finMs: 1000 });
    expect(s1.start_time).toBe(s1.end_time);
    expect(s1.attributes['healthradar.latencia_ms']).toBe(0);
    const s2 = span({ inicioMs: undefined, finMs: 2000 });
    expect(s2.start_time).toBe(s2.end_time);
  });

  test('nombre vacío usa "llm" y textos nulos quedan vacíos', () => {
    const s = span({ nombre: '', entrada: null, salida: undefined });
    expect(s.name).toBe('llm');
    expect(s.attributes['input.value']).toBe('');
    expect(s.attributes['output.value']).toBe('');
  });
});
