// @healthradar/core — auth/sesion.js
// ─────────────────────────────────────────────────────────
// Token de sesión opaco (256 bits). En la base solo se guarda su SHA-256 en hex
// (columna sesion.token_hash); el token en claro solo viaja en la cookie.
// El hash es sha256 del TEXTO del token (sus 64 caracteres hex), igual que
// encode(sha256('<token>'::bytea), 'hex') en la migración 008.

'use strict';

const crypto = require('crypto');

const TTL_MINUTOS_DEFECTO = 480; // 8 horas
const TTL_MINUTOS_MAX = 1440;    // 24 horas
const RE_TOKEN = /^[0-9a-f]{64}$/;

const sha256Hex = (texto) => crypto.createHash('sha256').update(texto, 'utf8').digest('hex');

/** TTL en minutos acotado a [1, 1440]; valores no numéricos usan el defecto. */
function normalizarTtl(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 1) return TTL_MINUTOS_DEFECTO;
  return Math.min(Math.floor(n), TTL_MINUTOS_MAX);
}

/**
 * Crea una sesión nueva.
 * @returns {{ token: string, token_hash: string, ttl_minutos: number, expira_en_seg: number }}
 */
function generarSesion({ ttlMinutos } = {}) {
  const ttl = normalizarTtl(ttlMinutos);
  const token = crypto.randomBytes(32).toString('hex');
  return { token, token_hash: sha256Hex(token), ttl_minutos: ttl, expira_en_seg: ttl * 60 };
}

/** SHA-256 hex de un token de cookie; null si el formato no es el de un token válido. */
function hashToken(token) {
  if (typeof token !== 'string' || !RE_TOKEN.test(token)) return null;
  return sha256Hex(token);
}

module.exports = { generarSesion, hashToken, normalizarTtl, TTL_MINUTOS_DEFECTO, TTL_MINUTOS_MAX };
