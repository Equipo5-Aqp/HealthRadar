'use strict';
const {
  motivoFallo, normalizarPolitica, compararSecreto, construirRespuestaLogin, construirRespuestaSesion,
  RESPUESTA_NO_AUTORIZADO, RESPUESTA_ERROR_INTERNO,
} = require('../politica');

describe('motivoFallo', () => {
  test('0 filas → no_existe', () => {
    expect(motivoFallo([])).toBe('no_existe');
    expect(motivoFallo(undefined)).toBe('no_existe');
  });
  test('bloqueado = true → bloqueado', () => {
    expect(motivoFallo([{ id_usuario: 1, intentos: 5, bloqueado: true }])).toBe('bloqueado');
  });
  test('en otro caso → credenciales', () => {
    expect(motivoFallo([{ id_usuario: 1, intentos: 2, bloqueado: false }])).toBe('credenciales');
    expect(motivoFallo([null])).toBe('credenciales');
  });
});

describe('normalizarPolitica', () => {
  test('defectos 5 y 15', () => {
    expect(normalizarPolitica()).toEqual({ max_intentos: 5, bloqueo_minutos: 15 });
  });
  test('acepta enteros ≥ 1 y descarta basura', () => {
    expect(normalizarPolitica({ maxIntentos: '3', bloqueoMinutos: 30.7 })).toEqual({ max_intentos: 3, bloqueo_minutos: 30 });
    expect(normalizarPolitica({ maxIntentos: 0, bloqueoMinutos: 'x' })).toEqual({ max_intentos: 5, bloqueo_minutos: 15 });
  });
});

describe('compararSecreto', () => {
  test('iguales → true; distintos → false', () => {
    expect(compararSecreto('abc123', 'abc123')).toBe(true);
    expect(compararSecreto('abc123', 'abc124')).toBe(false);
    expect(compararSecreto('abc', 'abcdef')).toBe(false);
  });
  test('un secreto ausente o vacío nunca autoriza (ni siquiera vacío contra vacío)', () => {
    expect(compararSecreto('', '')).toBe(false);
    expect(compararSecreto(undefined, undefined)).toBe(false);
    expect(compararSecreto('x', '')).toBe(false);
    expect(compararSecreto(null, 'x')).toBe(false);
    expect(compararSecreto(5, 5)).toBe(false);
  });
});

describe('respuestas', () => {
  test('fallo genérico: no menciona usuario ni contraseña ni bloqueo', () => {
    const t = JSON.stringify(RESPUESTA_NO_AUTORIZADO).toLowerCase();
    expect(t).not.toMatch(/bloquead|no existe|contraseña incorrecta/);
    expect(RESPUESTA_NO_AUTORIZADO.error).toBe(true);
  });
  test('error interno distinto del fallo de credenciales', () => {
    expect(RESPUESTA_ERROR_INTERNO.codigo).not.toBe(RESPUESTA_NO_AUTORIZADO.codigo);
  });
  test('respuesta de login', () => {
    expect(construirRespuestaLogin({ token: 't', email: 'a@b.co', rol: 'analista', expiraEnSeg: 60 }))
      .toEqual({ ok: true, token: 't', usuario: { email: 'a@b.co', rol: 'analista' }, expira_en_seg: 60 });
  });
  test('respuesta de sesión: sin token; fecha ISO', () => {
    const r = construirRespuestaSesion({ email: 'a@b.co', rol: 'admin', expiraAt: new Date('2026-10-06T10:00:00Z') });
    expect(r).toEqual({ ok: true, usuario: { email: 'a@b.co', rol: 'admin' }, expira_at: '2026-10-06T10:00:00.000Z' });
    expect(r.token).toBeUndefined();
    expect(construirRespuestaSesion({ email: 'a@b.co', rol: 'admin', expiraAt: '2026-01-01' }).expira_at).toBe('2026-01-01');
    expect(construirRespuestaSesion({ email: 'a@b.co', rol: 'admin' }).expira_at).toBeNull();
  });
});
