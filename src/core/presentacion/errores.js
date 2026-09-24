// @healthradar/core — presentacion/errores.js
// ─────────────────────────────────────────────────────────
// Clasificación de errores de proveedor de IA.
// Extraído de page.js del frontend.

'use strict';

const REGEX_LIMITE_IA = /rate limit|quota|too many requests|service unavailable|503/i;

/**
 * Determina si un error parece ser un límite de tasa/cuota de un proveedor de IA.
 *
 * @param {string} mensaje - Mensaje de error
 * @returns {boolean}
 */
function esLimiteIA(mensaje) {
  return REGEX_LIMITE_IA.test(mensaje || '');
}

/**
 * Genera el mensaje de error apropiado para el usuario.
 *
 * @param {string} mensajeOriginal - Mensaje de error original
 * @returns {string} Mensaje de error para mostrar al usuario
 */
function mensajeErrorUsuario(mensajeOriginal) {
  if (esLimiteIA(mensajeOriginal)) {
    return 'Los proveedores de IA no están disponibles en este momento. Intenta de nuevo en unos segundos.';
  }
  return 'No se pudo conectar con n8n. Verifica que el workflow esté activo. (' + mensajeOriginal + ')';
}

module.exports = { esLimiteIA, mensajeErrorUsuario, REGEX_LIMITE_IA };
