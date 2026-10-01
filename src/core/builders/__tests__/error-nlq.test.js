'use strict';
const { construirErrorNlq } = require('../error-nlq');
const core = require('../../index');

describe('construirErrorNlq', () => {
  test('limite de tasa (429) -> LIMITE_PROVEEDORES_IA', () => {
    const r = construirErrorNlq('The service is receiving too many requests from you');
    expect(r.cuerpo).toMatchObject({ error: true, codigo: 'LIMITE_PROVEEDORES_IA' });
    expect(r.cuerpo.mensaje).toMatch(/proveedores de IA/);
  });
  test('otro error -> PROVEEDORES_IA_NO_DISPONIBLES sin filtrar detalle tecnico', () => {
    const r = construirErrorNlq(new Error('ECONNRESET 10.0.0.5'));
    expect(r.cuerpo.codigo).toBe('PROVEEDORES_IA_NO_DISPONIBLES');
    expect(r.cuerpo.mensaje).not.toMatch(/10\.0\.0\.5/);
    expect(r.mensajeTecnico).toMatch(/ECONNRESET/);
  });
  test('objeto sin message se serializa', () => {
    expect(construirErrorNlq({ code: 503 }).mensajeTecnico).toBe('{"code":503}');
  });
  test('vacio o undefined usa mensaje por defecto', () => {
    expect(construirErrorNlq(undefined).mensajeTecnico).toMatch(/fallaron/);
    expect(construirErrorNlq('').cuerpo.error).toBe(true);
  });
  test('trunca el detalle tecnico a 500 caracteres', () => {
    expect(construirErrorNlq('x'.repeat(900)).mensajeTecnico).toHaveLength(500);
  });
  test('objeto no serializable cae a String()', () => {
    const c = {}; c.self = c;
    expect(construirErrorNlq(c).mensajeTecnico).toBe('[object Object]');
  });
  test('exportado en el index', () => {
    expect(core.construirErrorNlq).toBe(construirErrorNlq);
  });
});
