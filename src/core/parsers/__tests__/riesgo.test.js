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
  describe('variantes mal escritas por el modelo', () => {
    test.each([
      ['[NIVEL_RISK: medio]', 'medio'],
      ['[NIVEL_RISK: medio', 'medio'],
      ['[NIVEL DE RIESGO: Alto]', 'alto'],
      ['[NIVEL_DE_RIESGO: bajo]', 'bajo'],
      ['[nivel-riesgo = BAJO]', 'bajo'],
      ['[ NIVEL_RIESGO : alto ]', 'alto'],
    ])('%s -> %s y sale del texto', (marcador, nivel) => {
      const r = extraerNivelRiesgo({ output: `Respuesta.\n\n${marcador}` });
      expect(r.nivel_riesgo).toBe(nivel);
      expect(r.output).toBe('Respuesta.');
    });

    test('el caso del chat: marcador RISK al final de un párrafo largo', () => {
      const texto = 'La suma de los casos semanales es **17,597 casos** (desde 249 hasta 37).';
      const r = extraerNivelRiesgo({ output: `${texto}\n\n[NIVEL_RISK: medio]` });
      expect(r.output).toBe(texto);
      expect(r.nivel_riesgo).toBe('medio');
    });

    test('marcador en medio del texto: se quita y el resto se conserva', () => {
      const r = extraerNivelRiesgo({ output: 'Antes.\n[NIVEL_RISK: bajo]\nDespués.' });
      expect(r.nivel_riesgo).toBe('bajo');
      expect(r.output).not.toMatch(/NIVEL/i);
      expect(r.output).toContain('Antes.');
      expect(r.output).toContain('Después.');
    });

    test('no toca texto normal que nombra el nivel de riesgo', () => {
      const texto = 'El nivel de riesgo es medio según el boletín.';
      const r = extraerNivelRiesgo({ output: texto });
      expect(r.nivel_riesgo).toBeNull();
      expect(r.output).toBe(texto);
    });

    test('un nivel desconocido no se reconoce (se deja el texto como está)', () => {
      for (const t of ['[NIVEL_RIESGO: moderado]', '[NIVEL_RISK: medioambiente]']) {
        const r = extraerNivelRiesgo({ output: `Texto.\n${t}` });
        expect(r.nivel_riesgo).toBeNull();
        expect(r.output).toBe(`Texto.\n${t}`);
      }
    });
  });
});
