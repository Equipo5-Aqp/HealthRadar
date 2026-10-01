'use strict';
const { etiquetaModelo, modeloPorAgente } = require('../modelo');
const core = require('../../index');

describe('modeloPorAgente', () => {
  test('agente 1 = Kimi K3 (principal)', () => {
    expect(modeloPorAgente(1)).toEqual({ agente: 1, modelo: 'moonshotai/kimi-k3', proveedor: 'nvidia' });
  });
  test('agente 2 = GLM 5.3 (respaldo)', () => {
    expect(modeloPorAgente(2)).toEqual({ agente: 2, modelo: 'z-ai/glm-5.3', proveedor: 'nvidia' });
  });
  test('agentes 3 y 4 = Gemini', () => {
    expect(modeloPorAgente(3).proveedor).toBe('google');
    expect(modeloPorAgente(4)).toEqual({ agente: 4, modelo: 'gemini-3.6-flash', proveedor: 'google' });
  });
  test('valor desconocido cae en el principal', () => {
    expect(modeloPorAgente(9).agente).toBe(1);
    expect(modeloPorAgente(undefined).modelo).toBe('moonshotai/kimi-k3');
  });
  test('se exporta desde el index', () => {
    expect(core.modeloPorAgente(3).modelo).toBe('gemini-3.6-flash');
  });
});

describe('etiquetaModelo (GLM)', () => {
  test('GLM tiene su badge', () => {
    expect(etiquetaModelo('z-ai/glm-5.3').etiqueta).toBe('GLM');
    expect(etiquetaModelo('z-ai/glm-5.3-flash').etiqueta).toBe('GLM');
  });
  test('Kimi tiene su badge', () => {
    expect(etiquetaModelo('moonshotai/kimi-k3').etiqueta).toBe('Kimi');
  });
  test('los demas casos siguen igual', () => {
    expect(etiquetaModelo(null)).toBeNull();
    expect(etiquetaModelo('claude').etiqueta).toBe('Claude (respaldo)');
    expect(etiquetaModelo('gemini-3.6-flash').etiqueta).toBe('Gemini');
    expect(etiquetaModelo('otro').etiqueta).toBe('otro');
  });
});
