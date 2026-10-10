// @healthradar/core — auth/politica.js
// ─────────────────────────────────────────────────────────
// Política de login (HU-6): qué se registra, qué se responde y cómo se compara
// el secreto compartido del webhook. La criptografía de la contraseña y la
// atomicidad del contador viven en las funciones SQL de la migración 008.

'use strict';

const crypto = require('crypto');

const MAX_INTENTOS_DEFECTO = 5;
const BLOQUEO_MINUTOS_DEFECTO = 15;

/** Respuesta única para cualquier fallo (anti-enumeración): nunca dice qué falló. */
const RESPUESTA_NO_AUTORIZADO = Object.freeze({
  ok: false,
  error: true,
  codigo: 'CREDENCIALES_INVALIDAS',
  mensaje: 'Credenciales inválidas',
});

/** Respuesta cuando no se pudo atender (error interno): tampoco revela detalles. */
const RESPUESTA_ERROR_INTERNO = Object.freeze({
  ok: false,
  error: true,
  codigo: 'AUTH_NO_DISPONIBLE',
  mensaje: 'No se pudo completar la autenticación. Intenta nuevamente.',
});

/**
 * Motivo para login_evento.motivo según lo que devolvió fn_usuario_registrar_fallo:
 *   0 filas → 'no_existe'; bloqueado = true → 'bloqueado'; en otro caso → 'credenciales'.
 * @param {Array<{bloqueado?: boolean}>} filas
 */
function motivoFallo(filas) {
  if (!Array.isArray(filas) || filas.length === 0) return 'no_existe';
  return filas[0] && filas[0].bloqueado === true ? 'bloqueado' : 'credenciales';
}

/** Parámetros de bloqueo acotados (enteros ≥ 1); valores inválidos usan el defecto. */
function normalizarPolitica({ maxIntentos, bloqueoMinutos } = {}) {
  const entero = (v, d) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : d;
  };
  return {
    max_intentos: entero(maxIntentos, MAX_INTENTOS_DEFECTO),
    bloqueo_minutos: entero(bloqueoMinutos, BLOQUEO_MINUTOS_DEFECTO),
  };
}

/**
 * Compara el secreto del webhook en tiempo constante. Si cualquiera de los dos está
 * vacío (p. ej. la variable de entorno no está definida) devuelve false: un secreto
 * ausente nunca autoriza.
 */
function compararSecreto(recibido, esperado) {
  if (typeof recibido !== 'string' || typeof esperado !== 'string') return false;
  if (recibido === '' || esperado === '') return false;
  const h = (t) => crypto.createHash('sha256').update(t, 'utf8').digest();
  return crypto.timingSafeEqual(h(recibido), h(esperado));
}

/** Cuerpo de la respuesta de un login correcto. El token solo sale hacia mf-consulta. */
function construirRespuestaLogin({ token, email, rol, expiraEnSeg }) {
  return {
    ok: true,
    token,
    usuario: { email, rol },
    expira_en_seg: expiraEnSeg,
  };
}

/** Cuerpo de la respuesta de una sesión válida (nunca incluye token ni hash). */
function construirRespuestaSesion({ email, rol, expiraAt }) {
  return {
    ok: true,
    usuario: { email, rol },
    expira_at: expiraAt instanceof Date ? expiraAt.toISOString() : (expiraAt ?? null),
  };
}

module.exports = {
  RESPUESTA_NO_AUTORIZADO,
  RESPUESTA_ERROR_INTERNO,
  MAX_INTENTOS_DEFECTO,
  BLOQUEO_MINUTOS_DEFECTO,
  motivoFallo,
  normalizarPolitica,
  compararSecreto,
  construirRespuestaLogin,
  construirRespuestaSesion,
};
