// @healthradar/core — auth/credenciales.js
// ─────────────────────────────────────────────────────────
// Valida y normaliza lo que llega al webhook de login (HU-6).
// Funciones puras: sin HTTP ni base de datos. La contraseña NUNCA se devuelve
// dentro de un resultado inválido ni se escribe en ningún log.

'use strict';

const MAX_EMAIL = 254;     // límite práctico de RFC 5321
const MAX_PASSWORD = 128;  // bcrypt usa solo los primeros 72 bytes; se acota la entrada
const MAX_IP = 45;         // IPv6 completo en texto
const MAX_USER_AGENT = 200;

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_IP = /^[0-9a-fA-F:.]+$/;

/**
 * @param {{email?: any, password?: any}} body
 * @returns {{valido: true, email: string, password: string} | {valido: false, codigo: 'FORMATO_INVALIDO'}}
 */
function validarCredenciales(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (typeof b.email !== 'string' || typeof b.password !== 'string') {
    return { valido: false, codigo: 'FORMATO_INVALIDO' };
  }
  const email = b.email.trim().toLowerCase();
  const password = b.password; // sin trim: los espacios pueden ser parte de la contraseña
  if (email.length < 3 || email.length > MAX_EMAIL || !RE_EMAIL.test(email)) {
    return { valido: false, codigo: 'FORMATO_INVALIDO' };
  }
  if (password.length < 1 || password.length > MAX_PASSWORD) {
    return { valido: false, codigo: 'FORMATO_INVALIDO' };
  }
  return { valido: true, email, password };
}

/** IP del cliente (la envía mf-consulta). Devuelve null si no parece una IP. */
function normalizarIp(valor) {
  if (typeof valor !== 'string') return null;
  // X-Forwarded-For puede traer varias: la primera es el cliente original
  const primera = valor.split(',')[0].trim();
  if (primera === '' || primera.length > MAX_IP || !RE_IP.test(primera)) return null;
  return primera;
}

/** User-Agent acotado y sin caracteres de control. Devuelve null si queda vacío. */
function normalizarUserAgent(valor) {
  if (typeof valor !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const t = valor.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_USER_AGENT);
  return t === '' ? null : t;
}

module.exports = {
  validarCredenciales,
  normalizarIp,
  normalizarUserAgent,
  MAX_EMAIL,
  MAX_PASSWORD,
};
