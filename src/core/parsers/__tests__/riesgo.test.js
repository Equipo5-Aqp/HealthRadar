// Tests — parsers/riesgo.js
const { extraerNivelRiesgo } = require('../riesgo');

describe('extraerNivelRiesgo', () => {
  test('extrae nivel alto', () => {
    const r = extraerNivelRiesgo({ output: 'Análisis completo.\n[NIVEL_RIESGO: alto]' });
    expect(r.nivel_riesgo).toBe('alto');
    expect(r.output).toBe('Análisis completo.');
  });

  test('extrae nivel medio', () => {
    const r = extraerNivelRiesgo({ output: 'Todo normal.\n[NIVEL_RIESGO: medio]' });
    expect(r.nivel_riesgo).toBe('medio');
    expect(r.output).not.toContain('[NIVEL_RIESGO');
  });

  test('extrae nivel bajo', () => {
    const r = extraerNivelRiesgo({ output: 'Sin alertas.\n[NIVEL_RIESGO: bajo]' });
    expect(r.nivel_riesgo).toBe('bajo');
  });

  test('retorna null si no hay marcador', () => {
    const r = extraerNivelRiesgo({ output: 'Respuesta sin riesgo' });
    expect(r.nivel_riesgo).toBeNull();
    expect(r.output).toBe('Respuesta sin riesgo');
  });

  test('preserva otros campos del objeto', () => {
    const r = extraerNivelRiesgo({ output: 'Test\n[NIVEL_RIESGO: alto]', modelo_usado: 'gemini' });
    expect(r.modelo_usado).toBe('gemini');
    expect(r.nivel_riesgo).toBe('alto');
  });

  test('maneja output vacío', () => {
    const r = extraerNivelRiesgo({ output: '' });
    expect(r.nivel_riesgo).toBeNull();
  });

  test('maneja input null', () => {
    const r = extraerNivelRiesgo(null);
    expect(r.nivel_riesgo).toBeNull();
  });
});
