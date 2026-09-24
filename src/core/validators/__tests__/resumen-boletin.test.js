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
