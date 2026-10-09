'use strict';

const { extraerRespuestaLlm, colapsarRepeticion } = require('../respuesta-llm');

const resp = (content, extra = {}) => ({
  model: 'moonshotai/kimi-k3',
  choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 2756, completion_tokens: 281, total_tokens: 3037 },
  ...extra,
});

describe('extraerRespuestaLlm', () => {
  test('respuesta normal: texto, tokens reales, motivo y modelo', () => {
    expect(extraerRespuestaLlm(resp('  Hola  '))).toEqual({
      output: 'Hola',
      tokens: { prompt: 2756, completion: 281 },
      finishReason: 'stop',
      modeloRespuesta: 'moonshotai/kimi-k3',
    });
  });
  test('content nulo (razonamiento consumió max_tokens) → output vacío', () => {
    const r = extraerRespuestaLlm(resp(null, { choices: [{ message: { content: null, reasoning_content: 'pensando...' }, finish_reason: 'length' }] }));
    expect(r.output).toBe('');
    expect(r.finishReason).toBe('length');
  });
  test('content como arreglo de partes', () => {
    expect(extraerRespuestaLlm(resp([{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }, 'C'])).output).toBe('ABC');
  });
  test('sin usage → tokens null', () => {
    const r = extraerRespuestaLlm({ choices: [{ message: { content: 'x' } }] });
    expect(r.tokens).toBeNull();
    expect(r.finishReason).toBeNull();
    expect(r.modeloRespuesta).toBeNull();
  });
  test('usage incompleto → tokens null', () => {
    expect(extraerRespuestaLlm({ choices: [{ message: { content: 'x' } }], usage: { prompt_tokens: 10 } }).tokens).toBeNull();
  });
  test('entradas inválidas no lanzan error', () => {
    for (const v of [undefined, null, 'error 502 bad gateway', 42, {}, { choices: [] }, { choices: [{}] }]) {
      expect(extraerRespuestaLlm(v).output).toBe('');
    }
  });
});

describe('colapsarRepeticion (respuesta duplicada del modelo)', () => {
  const R = 'Para la SE 22-2025, el boletín reporta:\n- 29,757 casos sin signos de alarma\n\nTotal acumulado: 33,879 casos de dengue.';
  test('misma respuesta pegada dos veces (caso real de Kimi K3) → una sola', () => {
    expect(colapsarRepeticion(R + R)).toBe(R);
    expect(extraerRespuestaLlm(resp(R + R)).output).toBe(R);
  });
  test('con salto de línea o espacio entre las copias', () => {
    expect(colapsarRepeticion(R + '\n' + R)).toBe(R);
    expect(colapsarRepeticion(R + ' ' + R)).toBe(R);
    expect(colapsarRepeticion(R + '\n\n' + R)).toBe(R);
  });
  test('no toca textos normales, cortos o con repeticiones parciales', () => {
    expect(colapsarRepeticion(R)).toBe(R);
    expect(colapsarRepeticion('abab')).toBe('abab');
    expect(colapsarRepeticion(R + ' Y además ' + R)).toBe(R + ' Y además ' + R);
    expect(colapsarRepeticion('  ok  ')).toBe('ok');
  });
  test('no string → cadena vacía', () => {
    expect(colapsarRepeticion(null)).toBe('');
    expect(colapsarRepeticion(undefined)).toBe('');
  });
});
