// @healthradar/core — builders/traza-phoenix.js
// ─────────────────────────────────────────────────────────
// Arma el span que se envía a Arize Phoenix (ADR-010) por cada ejecución LLM.
// Destino: POST /v1/projects/{proyecto}/spans  con body { data: [span] }.
// Atributos siguen la convención OpenInference (la que Phoenix muestra en su UI).
//
// Función pura: no hace HTTP. n8n arma el span con esto y lo envía en un nodo HTTP.

'use strict';

const crypto = require('crypto');

/**
 * Estimación de tokens (~4 caracteres por token). SOLO se usa cuando el modelo
 * no informa el consumo real; el span lo marca con healthradar.tokens_estimados = true.
 */
function estimarTokens(texto) {
  const largo = typeof texto === 'string' ? texto.length : 0;
  return Math.ceil(largo / 4);
}

const hex = (bytes) => crypto.randomBytes(bytes).toString('hex');

const aTexto = (v) => (v === undefined || v === null ? '' : String(v));

/**
 * @param {object} p
 * @param {string} p.nombre       - Nombre del span (ej. 'nlq.consulta', 'boletin.resumen')
 * @param {string} p.entrada      - Pregunta o prompt de usuario
 * @param {string} p.salida       - Respuesta generada
 * @param {string} p.modelo       - Modelo que respondió (ej. 'gemini-3.6-flash')
 * @param {number} p.inicioMs     - Date.now() al comenzar
 * @param {number} p.finMs        - Date.now() al terminar
 * @param {string} [p.sessionId]  - Identificador de sesión
 * @param {boolean} [p.exito=true]
 * @param {string} [p.error]      - Mensaje de error si exito = false
 * @param {number} [p.promptChars] - Largo del prompt completo enviado al LLM (para estimar tokens)
 * @param {{prompt:number, completion:number}} [p.tokens] - Consumo REAL si el modelo lo informa
 * @param {object} [p.metadatos]  - Atributos extra (nivel_riesgo, agente, etc.)
 * @param {{traceId:string, spanId:string}} [p.ids] - Solo para tests deterministas
 * @returns {{ data: object[] }} body listo para el endpoint de Phoenix
 */
function construirTrazaPhoenix(p) {
  const exito = p.exito !== false;
  const inicio = Number(p.inicioMs);
  const fin = Number(p.finMs);
  const inicioOk = Number.isFinite(inicio) ? inicio : fin;
  const finOk = Number.isFinite(fin) ? Math.max(fin, inicioOk) : inicioOk;

  const real = p.tokens && Number.isFinite(p.tokens.prompt) && Number.isFinite(p.tokens.completion);
  const promptTokens = real ? p.tokens.prompt : estimarTokens(p.promptChars ? 'x'.repeat(p.promptChars) : aTexto(p.entrada));
  const completionTokens = real ? p.tokens.completion : estimarTokens(aTexto(p.salida));

  const attributes = {
    'openinference.span.kind': 'LLM',
    'input.value': aTexto(p.entrada),
    'output.value': aTexto(p.salida),
    'llm.model_name': aTexto(p.modelo),
    'llm.token_count.prompt': promptTokens,
    'llm.token_count.completion': completionTokens,
    'llm.token_count.total': promptTokens + completionTokens,
    'healthradar.tokens_estimados': !real,
    'healthradar.latencia_ms': finOk - inicioOk,
    ...(p.sessionId ? { 'session.id': aTexto(p.sessionId) } : {}),
  };
  for (const [k, v] of Object.entries(p.metadatos || {})) {
    if (v !== undefined && v !== null) attributes['healthradar.' + k] = v;
  }

  const ids = p.ids || {};
  return {
    data: [{
      name: aTexto(p.nombre) || 'llm',
      context: { trace_id: ids.traceId || hex(16), span_id: ids.spanId || hex(8) },
      span_kind: 'LLM',
      parent_id: null,
      start_time: new Date(inicioOk).toISOString(),
      end_time: new Date(finOk).toISOString(),
      status_code: exito ? 'OK' : 'ERROR',
      status_message: exito ? '' : aTexto(p.error),
      attributes,
    }],
  };
}

module.exports = { construirTrazaPhoenix, estimarTokens };
