// @healthradar/core — builders/mensajes-chat.js
// ─────────────────────────────────────────────────────────
// Arma lo que se envía a un modelo por HTTP (API compatible con OpenAI:
// POST /v1/chat/completions) y prepara el historial del chat.
//
// Reemplaza al AI Agent + "Simple Memory" para Kimi y GLM:
//   - el prompt (SYSTEM_PROMPT_CONEXION) va DENTRO del mensaje de usuario,
//     con el mismo texto que antes armaba la expresión del agente;
//   - el historial (memoria) sale de la tabla chat_mensaje (migración 009).
//
// Sin HTTP ni base de datos. Unica fuente de azar: el UUID de request_id cuando no se entrega uno.

'use strict';

const crypto = require('crypto');

const MAX_SESSION_ID = 64;
const VUELTAS_DEFECTO = 3;          // 3 vueltas = 6 mensajes (pregunta + respuesta)
const MAX_CARACTERES_DEFECTO = 1000; // por mensaje del historial
const MAX_CARACTERES_GUARDADO = 4000; // límite de la tabla chat_mensaje
const ROLES = ['user', 'assistant'];
// Encabezado del bloque de búsqueda semántica. Los AI Agent de respaldo (Gemini) lo repiten en su
// expresión: si se cambia aquí, cambiarlo también en esos nodos (la simulación del flujo lo comprueba).
const ENCABEZADO_RAG = 'Boletines de OTROS periodos relacionados con la pregunta (busqueda semantica). ' +
  'Usalos solo como contexto adicional; indica de que semana es cada cifra y no la mezcles con las del periodo consultado:';

const aTexto = (v) => (v === undefined || v === null ? '' : String(v));

/** Identificador de sesión seguro: texto recortado a 64 caracteres ('' si no hay). */
function normalizarSessionId(valor) {
  return aTexto(valor).trim().slice(0, MAX_SESSION_ID);
}

/** Recorta a `max` caracteres agregando '…' si hubo corte. */
function recortar(texto, max) {
  const t = aTexto(texto).trim();
  if (!Number.isFinite(max) || max <= 0 || t.length <= max) return t;
  return t.slice(0, Math.max(1, max - 1)).trimEnd() + '…';
}

/**
 * Convierte las filas de chat_mensaje (cronológicas) en mensajes del modelo.
 * - descarta filas vacías o con rol desconocido;
 * - se queda con los últimos `maxVueltas * 2` mensajes;
 * - recorta cada mensaje a `maxCaracteres`;
 * - el historial siempre empieza con un mensaje de usuario.
 *
 * @param {Array<{rol:string, contenido:string}>} filas
 * @param {{maxVueltas?:number, maxCaracteres?:number}} [opts]
 * @returns {Array<{role:'user'|'assistant', content:string}>}
 */
function normalizarHistorial(filas, opts = {}) {
  const maxVueltas = Number.isFinite(opts.maxVueltas) ? opts.maxVueltas : VUELTAS_DEFECTO;
  const maxCaracteres = Number.isFinite(opts.maxCaracteres) ? opts.maxCaracteres : MAX_CARACTERES_DEFECTO;
  if (!Array.isArray(filas) || maxVueltas <= 0) return [];

  const limpios = filas
    .filter((f) => f && ROLES.includes(f.rol) && aTexto(f.contenido).trim() !== '')
    .map((f) => ({ role: f.rol, content: recortar(f.contenido, maxCaracteres) }));

  const ultimos = limpios.slice(-(maxVueltas * 2));
  while (ultimos.length && ultimos[0].role !== 'user') ultimos.shift();
  return ultimos;
}

/**
 * Mensaje de usuario para el modelo. Es EXACTAMENTE el texto que armaba la
 * expresión de los AI Agent (prompt externo + contexto + pregunta).
 */
function construirPromptUsuario(p) {
  const tendencia = p.textoTendencia
    ? 'Tendencia de casos historica para el departamento mencionado:\n' + p.textoTendencia + '\n\n'
    : '';
  // Búsqueda semántica (HU-3): bloque opcional. Sin contexto recuperado el texto es idéntico al de siempre.
  const rag = aTexto(p.textoRag).trim()
    ? '\n\n' + ENCABEZADO_RAG + '\n' + aTexto(p.textoRag).trim()
    : '';
  return (
    aTexto(p.promptSistema) +
    '\n\nEl analista pregunto por el siguiente periodo: ' + aTexto(p.criterioPeriodo) +
    ' (' + aTexto(p.cantidadBoletines) + ' boletin(es) encontrados para ese periodo).' +
    '\n\nResumenes de los boletines epidemiologicos de ese periodo:\n' + aTexto(p.textoBoletines) +
    rag +
    '\n\nDatos climaticos (promedio nacional) de las mismas semanas:\n' + aTexto(p.textoClima) +
    '\n\n' + tendencia +
    'El analista pregunta lo siguiente:\n' + aTexto(p.pregunta)
  );
}

/**
 * Arma el arreglo `messages` de la API de chat: [...historial, usuario actual].
 *
 * @param {object} p
 * @param {string} p.promptSistema    - $env.SYSTEM_PROMPT_CONEXION
 * @param {string} p.criterioPeriodo  - de "Consolidar boletines + clima del periodo"
 * @param {number|string} p.cantidadBoletines
 * @param {string} p.textoBoletines
 * @param {string} p.textoClima
 * @param {string} [p.textoTendencia]
 * @param {string} [p.textoRag]       - boletines recuperados por similitud (construirContextoRag); '' = sin bloque
 * @param {string} p.pregunta
 * @param {Array<{rol:string, contenido:string}>} [p.historial] - filas de chat_mensaje
 * @param {number} [p.maxVueltas]
 * @param {number} [p.maxCaracteres]
 * @returns {Array<{role:string, content:string}>}
 */
function construirMensajesChat(p) {
  if (!aTexto(p.promptSistema).trim()) {
    throw new Error('Falta SYSTEM_PROMPT_CONEXION (el prompt no puede estar vacio)');
  }
  const historial = normalizarHistorial(p.historial, { maxVueltas: p.maxVueltas, maxCaracteres: p.maxCaracteres });
  return [...historial, { role: 'user', content: construirPromptUsuario(p) }];
}

/**
 * Cuerpo JSON para POST /v1/chat/completions (NVIDIA y cualquier API compatible).
 */
function construirCuerpoChat({ modelo, messages, maxTokens = 2048, temperature = 0.2 }) {
  if (!modelo) throw new Error('Falta el modelo');
  if (!Array.isArray(messages) || messages.length === 0) throw new Error('Faltan los mensajes');
  return { model: modelo, messages, max_tokens: maxTokens, temperature, stream: false };
}

/**
 * Identificador de una vuelta (pregunta + respuesta) para la idempotencia del
 * guardado: UNIQUE (request_id, rol) en chat_mensaje. Si no llega uno, se genera
 * un UUID. Se calcula UNA vez aqui (aguas arriba del nodo Postgres) para que un
 * reintento del nodo reutilice el mismo valor y no duplique la vuelta.
 */
function normalizarRequestId(valor) {
  const t = aTexto(valor).trim().slice(0, 64);
  return t !== '' ? t : crypto.randomUUID();
}

/**
 * Datos a guardar en chat_mensaje tras responder. `guardar = false` si no hay
 * sessionId o falta la pregunta o la respuesta (no se escribe nada: ni siquiera
 * la pregunta sola, para no dejar un turno "user" huerfano en el historial).
 */
function prepararGuardadoHistorial({ sessionId, pregunta, respuesta, requestId }) {
  const sid = normalizarSessionId(sessionId);
  const q = recortar(pregunta, MAX_CARACTERES_GUARDADO);
  const r = recortar(respuesta, MAX_CARACTERES_GUARDADO);
  return {
    guardar: sid !== '' && q !== '' && r !== '',
    session_id: sid,
    request_id: normalizarRequestId(requestId),
    pregunta: q,
    respuesta: r,
  };
}

module.exports = {
  ENCABEZADO_RAG,
  normalizarSessionId,
  normalizarHistorial,
  construirPromptUsuario,
  construirMensajesChat,
  construirCuerpoChat,
  prepararGuardadoHistorial,
  normalizarRequestId,
  VUELTAS_DEFECTO,
  MAX_CARACTERES_DEFECTO,
};
