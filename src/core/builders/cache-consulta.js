// @healthradar/core — builders/cache-consulta.js
// ─────────────────────────────────────────────────────────
// Sprint 4 · HU3 (caché de preguntas frecuentes): si una pregunta ya se respondió hace poco y los datos
// no cambiaron, el chat devuelve la respuesta guardada en vez de volver a llamar al modelo (segundos → ms).
//
// Qué se guarda y cuándo (todo decidido aquí, sin LLM):
//   · Solo la PRIMERA pregunta de una sesión (sin historial). Un seguimiento («¿y en Lima?») depende de
//     lo conversado, así que nunca se sirve ni se guarda desde la caché.
//   · Solo respuestas sanas: con texto, sin advertencia de cifras, sin error y con la verificación de cifras
//     ejecutada (si «Verificar cifras» falló, la respuesta sale igual pero no se guarda).
//   · Preguntas con palabras de tiempo relativo («hoy», «ayer», «esta semana»…) no se guardan: su
//     respuesta cambia aunque los datos no cambien.
//   · La clave sale de la pregunta NORMALIZADA (sin tildes, mayúsculas ni signos) + la huella del prompt
//     del sistema + VERSION_CACHE. Si cambia el prompt o se sube VERSION_CACHE, las entradas viejas dejan
//     de coincidir solas.
//   · Los DATOS entran por `version_datos` (la calcula PostgreSQL: boletines procesados + clima). Si llega
//     un boletín nuevo o se reprocesa uno, la entrada deja de servir aunque no haya vencido.
//   · Vence a las 24 h (TTL_HORAS).
//
// Puro: sin n8n, sin PostgreSQL, sin red. El flujo solo ejecuta el SQL que corresponde a cada decisión.

'use strict';

const crypto = require('crypto');
const { normalizarSessionId } = require('./mensajes-chat');

/** Súbela cuando cambie la FORMA de la respuesta o la forma de armar la clave: invalida toda la caché. */
const VERSION_CACHE = 'v1';
const TTL_HORAS = 24;
/** Tope de entradas vivas: evita que preguntas libres hagan crecer la tabla sin límite. */
const MAX_ENTRADAS = 2000;
const MAX_PREGUNTA_NORMALIZADA = 300;
const MAX_RESPUESTA = 12000;

/** Campos de la respuesta que se guardan (lista blanca: nada interno del flujo llega a la tabla). */
const CAMPOS_RESPUESTA = ['output', 'nivel_riesgo', 'modelo_usado', 'proveedor', 'agente'];

// Palabras que atan la respuesta al día de hoy (o a la semana calendario en curso). Se buscan sobre la
// pregunta ya normalizada. «situacion actual» o «ultimas semanas» (sin número) SÍ se cachean: dependen solo
// del último boletín, y eso ya lo cubre version_datos. En cambio lo que detectarPeriodo mide desde la fecha
// de hoy («este año», «el año pasado», «el ultimo año», «ultimas 4 semanas», «ultimos 6 meses»…) cambia
// con los días y no entra a la caché.
const NUMERO = '(?:\\d{1,3}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)';
const RELATIVAS = new RegExp(
  '\\b(hoy|ayer|anteayer|antier|manana|ahora|ahorita|actualmente|en este momento|esta semana|semana actual|semana en curso|' +
  'semana pasada|semana anterior|ultima semana|este mes|mes pasado|mes anterior|mes actual|mes en curso|esta noche|' +
  'este ano|ano pasado|ano anterior|ano actual|ano en curso|lo que va del ano|lo que va de este ano|' +
  'hace ' + NUMERO + ' anos?|ultimo (?:mes|ano|trimestre|semestre)|ultim[oa]s ' + NUMERO + ' (?:semanas|meses|anos))\\b'
);

const aTexto = v => (typeof v === 'string' ? v : '');

/**
 * «¿Cuántos casos de DENGUE hubo en la SE 22?» y «cuantos casos de dengue hubo en la se 22» → misma cadena.
 * Sin tildes, en minúsculas, signos y espacios sobrantes fuera.
 */
function normalizarPregunta(texto) {
  return aTexto(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Primeros 16 caracteres del SHA-256 del prompt del sistema ('' si no hay prompt). */
function huellaPrompt(prompt) {
  const p = aTexto(prompt);
  if (p === '') return '';
  return crypto.createHash('sha256').update(p).digest('hex').slice(0, 16);
}

/** Motivo por el que la pregunta no entra a la caché, o null si puede entrar. */
function motivoPreguntaNoCacheable(normalizada) {
  if (normalizada === '') return 'sin_pregunta';
  if (normalizada.length > MAX_PREGUNTA_NORMALIZADA) return 'pregunta_larga';
  if (RELATIVAS.test(normalizada)) return 'tiempo_relativo';
  return null;
}

/** Clave SHA-256 (64 hex) de la pregunta normalizada + huella del prompt + versión. '' si no aplica. */
function claveCache(pregunta, prompt) {
  const normalizada = normalizarPregunta(pregunta);
  if (motivoPreguntaNoCacheable(normalizada) !== null) return '';
  return crypto.createHash('sha256')
    .update([VERSION_CACHE, huellaPrompt(prompt), normalizada].join('\u0001'))
    .digest('hex');
}

/**
 * Parámetros de la BÚSQUEDA en caché (antes de armar el contexto y llamar al modelo).
 * `consultar` es false si la pregunta no es cacheable; el SQL además descarta sesiones con historial.
 *
 * @param {{pregunta?:string, sessionId?:string, prompt?:string}} p
 * @returns {{ clave:string, consultar:boolean, session_id:string }}
 */
function prepararBusquedaCache({ pregunta, sessionId, prompt } = {}) {
  const clave = claveCache(pregunta, prompt);
  return { clave, consultar: clave !== '', session_id: normalizarSessionId(sessionId) };
}

/**
 * Decide si la respuesta recién generada se guarda y arma los parámetros del INSERT.
 *
 * @param {{
 *   pregunta?:string, sessionId?:string, prompt?:string,
 *   respuesta?:object,          // salida de «Verificar cifras» (output, nivel_riesgo, modelo_usado, …)
 *   hayHistorial?:boolean,      // ¿el modelo vio mensajes anteriores de la sesión?
 *   versionDatos?:string,       // la que devolvió la búsqueda en caché (versión de los datos al preguntar)
 *   ttlHoras?:number
 * }} p
 * @returns {{ guardar:boolean, motivo:string|null, clave:string, pregunta:string, version_datos:string,
 *             respuesta_json:string, ttl_horas:number, max_entradas:number }}
 */
function prepararGuardadoCache({ pregunta, prompt, respuesta, hayHistorial, versionDatos, ttlHoras } = {}) {
  const normalizada = normalizarPregunta(pregunta);
  const r = respuesta && typeof respuesta === 'object' ? respuesta : {};
  const output = aTexto(r.output).trim();
  const version = aTexto(versionDatos).trim();
  const ttl = Number.isInteger(ttlHoras) && ttlHoras > 0 ? ttlHoras : TTL_HORAS;

  let motivo = motivoPreguntaNoCacheable(normalizada);
  if (motivo === null && hayHistorial !== false) motivo = 'con_historial'; // ante la duda, no se guarda
  if (motivo === null && version === '') motivo = 'sin_version_datos';
  if (motivo === null && output === '') motivo = 'sin_respuesta';
  if (motivo === null && output.length > MAX_RESPUESTA) motivo = 'respuesta_larga';
  if (motivo === null && (r.error || r.advertencia_cifras)) motivo = 'respuesta_con_advertencia';
  // «Verificar cifras» falla abierto (la respuesta sale sin aviso). Esa respuesta no se guarda: sin verificar,
  // no puede servirse después como si estuviera revisada.
  if (motivo === null && r._verificacion && r._verificacion.fallo === true) motivo = 'verificacion_fallida';

  const base = { clave: '', pregunta: '', version_datos: '', respuesta_json: '{}', ttl_horas: ttl, max_entradas: MAX_ENTRADAS };
  if (motivo !== null) return { guardar: false, motivo, ...base };

  const payload = {};
  for (const campo of CAMPOS_RESPUESTA) if (r[campo] !== undefined) payload[campo] = r[campo];
  payload.output = output;
  return {
    guardar: true,
    motivo: null,
    clave: claveCache(pregunta, prompt),
    pregunta: normalizada,
    version_datos: version,
    respuesta_json: JSON.stringify(payload),
    ttl_horas: ttl,
    max_entradas: MAX_ENTRADAS,
  };
}

/**
 * Respuesta para el front cuando hubo acierto: la guardada + `desde_cache` y su antigüedad.
 * Mismo contrato que una respuesta nueva (output, nivel_riesgo, modelo_usado…), así el front no cambia.
 *
 * @param {{respuesta?:object|string, creado_en?:string|Date}} fila - fila devuelta por la búsqueda
 * @param {Date} [ahora]
 * @returns {object|null} null si la fila no trae una respuesta utilizable
 */
function construirRespuestaCache(fila, ahora) {
  let guardada = fila && fila.respuesta;
  if (typeof guardada === 'string') {
    try { guardada = JSON.parse(guardada); } catch { return null; }
  }
  if (!guardada || typeof guardada !== 'object' || aTexto(guardada.output).trim() === '') return null;

  const out = {};
  for (const campo of CAMPOS_RESPUESTA) if (guardada[campo] !== undefined) out[campo] = guardada[campo];
  const creado = fila.creado_en instanceof Date ? fila.creado_en.getTime() : Date.parse(fila.creado_en);
  const ahoraMs = ahora instanceof Date ? ahora.getTime() : Date.now();
  const edad = Number.isFinite(creado) ? Math.max(0, Math.floor((ahoraMs - creado) / 60000)) : null;
  return { ...out, desde_cache: true, cache_edad_minutos: edad };
}

module.exports = {
  normalizarPregunta,
  huellaPrompt,
  claveCache,
  prepararBusquedaCache,
  prepararGuardadoCache,
  construirRespuestaCache,
  VERSION_CACHE,
  TTL_HORAS,
  MAX_ENTRADAS,
  MAX_PREGUNTA_NORMALIZADA,
  MAX_RESPUESTA,
  CAMPOS_RESPUESTA,
};
