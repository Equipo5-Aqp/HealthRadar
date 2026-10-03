// @healthradar/core — builders/error-nlq.js
// ─────────────────────────────────────────────────────────
// Cuerpo de error del webhook NLQ cuando fallan todos los agentes
// de la cadena de failover (HU-12). El flujo lo responde con HTTP 503.

'use strict';

const { esLimiteIA, mensajeErrorUsuario } = require('../presentacion/errores');

/**
 * @param {*} errorCrudo - error del nodo agente (string, Error u objeto {message})
 * @returns {{ mensajeTecnico: string, cuerpo: { error: true, codigo: string, mensaje: string } }}
 */
function construirErrorNlq(errorCrudo) {
  let tecnico = '';
  if (typeof errorCrudo === 'string') tecnico = errorCrudo;
  else if (errorCrudo && typeof errorCrudo.message === 'string') tecnico = errorCrudo.message;
  else if (errorCrudo) { try { tecnico = JSON.stringify(errorCrudo); } catch (e) { tecnico = String(errorCrudo); } }
  if (!tecnico) tecnico = 'Todos los proveedores de IA fallaron';

  const limite = esLimiteIA(tecnico);
  return {
    mensajeTecnico: tecnico.slice(0, 500),
    cuerpo: {
      error: true,
      codigo: limite ? 'LIMITE_PROVEEDORES_IA' : 'PROVEEDORES_IA_NO_DISPONIBLES',
      // Sin el detalle tecnico: no exponer mensajes internos al front
      mensaje: limite
        ? mensajeErrorUsuario(tecnico)
        : 'Los proveedores de IA no están disponibles en este momento. Intenta de nuevo en unos segundos.',
    },
  };
}

module.exports = { construirErrorNlq };
