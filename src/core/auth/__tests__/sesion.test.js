'use strict';
const crypto = require('crypto');
const { generarSesion, hashToken, normalizarTtl } = require('../sesion');

describe('generarSesion', () => {
  test('token de 64 hex y hash = sha256 del texto del token', () => {
    const s = generarSesion();
    expect(s.token).toMatch(/^[0-9a-f]{64}$/);
    expect(s.token_hash).toBe(crypto.createHash('sha256').update(s.token).digest('hex'));
    expect(s.token_hash).not.toBe(s.token);
  });
  test('cada sesión es distinta', () => {
    expect(generarSesion().token).not.toBe(generarSesion().token);
  });
  test('TTL por defecto 480 min y expira_en_seg coherente', () => {
    const s = generarSesion();
    expect(s.ttl_minutos).toBe(480);
    expect(s.expira_en_seg).toBe(28800);
  });
  test('TTL acotado a [1, 1440]; inválido usa el defecto', () => {
    expect(generarSesion({ ttlMinutos: 10 }).ttl_minutos).toBe(10);
    expect(generarSesion({ ttlMinutos: 99999 }).ttl_minutos).toBe(1440);
    expect(normalizarTtl(0)).toBe(480);
    expect(normalizarTtl('abc')).toBe(480);
    expect(normalizarTtl(-5)).toBe(480);
    expect(normalizarTtl(2.9)).toBe(2);
  });
});

describe('hashToken', () => {
  test('coincide con el hash generado', () => {
    const s = generarSesion();
    expect(hashToken(s.token)).toBe(s.token_hash);
  });
  test('formato inválido devuelve null', () => {
    for (const t of [undefined, null, 5, '', 'abc', 'G'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64)]) {
      expect(hashToken(t)).toBeNull();
    }
  });
});
