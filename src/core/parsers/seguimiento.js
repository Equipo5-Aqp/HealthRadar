// @healthradar/core — parsers/seguimiento.js
// ─────────────────────────────────────────────────────────
// Preguntas de seguimiento ("¿y en Piura?"): los detectores (período, departamento, enfermedad) leen
// solo el mensaje nuevo, así que un seguimiento sin período caía en "las últimas 12 semanas" aunque la
// pregunta anterior fuera de otra semana. Estas funciones completan lo que FALTA en el mensaje nuevo con
// lo que dijo el usuario en sus preguntas anteriores de la misma conversación. Lo que el mensaje nuevo
// SÍ dice siempre manda; sin historial o sin seguimiento devuelven exactamente lo que el detector base.
//
// Reglas (revisión del PR #214):
//   · Solo hereda un seguimiento de verdad. Una pregunta completa ("en qué consiste la EDA?",
//     "pero qué es el dengue?") no hereda nada: tras una preposición o un conector (salvo «y»), una
//     palabra interrogativa la marca como pregunta nueva.
//   · Un período relativo no se reemplaza por el de la pregunta anterior. Si detectarPeriodo lo interpreta
//     ("el año pasado", "esta semana", "hoy", "las últimas 4 semanas") se usa esa fecha, medida desde hoy;
//     si es difuso ("últimas semanas", "actualmente", "reciente") cae en la ventana por defecto, como siempre.
//   · Pedir otro alcance ("a nivel país", "en la costa", "qué departamento…", "todas las enfermedades")
//     no hereda el departamento ni la enfermedad.
//   · La herencia no salta un cambio de tema: el contexto de una pregunta viene de la pregunta anterior
//     solo si esa pregunta era a su vez un seguimiento. Una pregunta completa corta la cadena.
//   · Semana o mes sin año ("y en la SE 10?", "y en marzo?") toman el año de la pregunta anterior.
//
// Sin LLM y sin red: solo regex sobre los textos.

'use strict';

const { detectarPeriodo, _internal } = require('./periodo');
const { detectarDepartamento } = require('./departamento');
const { detectarEnfermedad } = require('./enfermedad');

/** Cuántas preguntas anteriores se miran como máximo (la más reciente primero). */
const MAX_PREVIAS = 4;

/** Una pregunta con preposición al inicio solo se considera seguimiento si es corta ("en Piura", "en la SE 10 de 2026"). */
const MAX_PALABRAS_ELIPTICA = 7;

const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Minúsculas, sin tildes ni signos, espacios simples. */
function normalizar(texto) {
  return sinTildes(typeof texto === 'string' ? texto : '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// «y en Piura», «e en Lima»: el «y» inicial es la marca más clara de seguimiento.
const INICIO_Y = /^(y|e)\b/;
// «también en Lima», «ahora en 2024», «pero en 2023»: conectores; si siguen con una interrogativa es una pregunta nueva.
const INICIO_CONECTOR = /^(o|tambien|ademas|igual|pero|entonces|ahora)\b\s*(.*)$/;
// «en Piura», «de EDA», «para San Martín»: preposición inicial; si sigue una interrogativa es una pregunta nueva.
const PREPOSICION_INICIAL = /^(en|de|del|para|con|sobre|a)\b\s*(.*)$/;
const INTERROGATIVO = /^(que|cual|cuales|como|donde|adonde|cuando|cuanto|cuanta|cuantos|cuantas|quien|quienes|por que)\b/;
// «lo mismo», «ahí», «en esas semanas», «ese departamento»…
const REFERENCIA = /\b(lo mismo|igual que|ahi|alli|ese periodo|esa semana|esas semanas|ese ano|ese departamento|esos departamentos|esa fecha|esas fechas|mismo periodo|misma semana|mismas semanas|mismo departamento|mismos departamentos|misma fecha|mismas fechas)\b/;

// Si el usuario pide el panorama nacional, "por departamento" o una región, no se le pega el departamento anterior.
const ALCANCE_NACIONAL = /\b(nacional|nivel pais|todo el pais|todo el peru|todo peru|en el pais|del pais|el peru|resto del pais|todos los departamentos|los demas departamentos|resto de los departamentos|cada departamento|por departamento|(?:que|cual|cuales) (?:es |son )?(?:el |los )?departamentos?|en que departamentos?|(?:la|las) (?:costa|sierra|selva|amazonia))\b/;
// Lo mismo con la enfermedad: «todas las enfermedades», «las otras enfermedades», «qué enfermedad…».
const ALCANCE_ENFERMEDADES = /\b(todas las enfermedades|otras enfermedades|demas enfermedades|cada enfermedad|por enfermedad|(?:que|cual|cuales) (?:es |son )?(?:la |las )?enfermedad(?:es)?)\b/;

// Períodos que dependen de «hoy»: no se reemplazan por el período de la pregunta anterior.
const PERIODO_RELATIVO = /\b(ultim[oa]s?|recientes?|recientemente|actual(?:es|mente)?|hoy|ayer|anteayer|ahorita|en este momento|esta semana|este mes|este ano|semanas? pasadas?|mes(?:es)? pasados?|anos? pasados?|en lo que va (?:del|de la) (?:ano|mes|semana)|(?:a|hasta) la fecha)\b/;

const REGEX_ANIO = /\b20[1-2]\d\b/;
const REGEX_SEMANA = /\b(?:semana|se)\s*\d{1,2}\b/;
const MESES_ALTERNATIVA = Object.keys(_internal.MESES).join('|');
const REGEX_MES = new RegExp(`\\b(${MESES_ALTERNATIVA})\\b`);
// «entre enero y marzo»: el año va al final del rango, no después del primer mes.
const REGEX_RANGO_MESES = new RegExp(`\\bentre\\s+(?:${MESES_ALTERNATIVA})\\s+y\\s+(?:${MESES_ALTERNATIVA})\\b`);

/**
 * ¿Parece un seguimiento de lo anterior? Conservador: una pregunta completa e independiente
 * ("Dime los casos de la SE 12 de 2025", "¿en qué consiste la EDA?") NO hereda nada, aunque venga
 * después de otras.
 *
 * @param {string} pregunta
 * @returns {boolean}
 */
function esSeguimiento(pregunta) {
  const t = normalizar(pregunta);
  if (t === '') return false;
  if (INICIO_Y.test(t) || REFERENCIA.test(t)) return true;
  const conector = t.match(INICIO_CONECTOR);
  if (conector) return !INTERROGATIVO.test(conector[2]);
  const preposicion = t.match(PREPOSICION_INICIAL);
  if (preposicion) return !INTERROGATIVO.test(preposicion[2]) && t.split(' ').length <= MAX_PALABRAS_ELIPTICA;
  return false;
}

/**
 * Preguntas anteriores del usuario, la más reciente primero. Acepta el arreglo tal cual o como texto JSON
 * (así lo devuelve a veces el nodo de Postgres); ignora lo que no sea texto.
 *
 * @param {string[]|string|null|undefined} previas
 * @returns {string[]}
 */
function preguntasPrevias(previas) {
  let lista = previas;
  if (typeof lista === 'string') {
    try { lista = JSON.parse(lista); } catch { lista = []; }
  }
  if (!Array.isArray(lista)) return [];
  return lista.filter((p) => typeof p === 'string' && p.trim() !== '').slice(0, MAX_PREVIAS);
}

const tienePeriodo = (d) => (d.anio !== null && d.anio !== undefined) || d.rango_anios === true;
const tieneEnfermedad = (e) => e.enfermedad_especifica === true || e.otra_enfermedad_mencionada === true;

/** Pone el año justo después de la semana, del mes o del rango de meses ("y en marzo" → "y en marzo de 2024"). */
function ponerAnio(pregunta, anio) {
  const texto = String(pregunta).toLowerCase().replace(/[¿?¡!.,;:]/g, ' ');
  const regex = [REGEX_SEMANA, REGEX_RANGO_MESES].find((r) => r.test(texto)) || REGEX_MES;
  return texto.replace(regex, (m) => `${m} de ${anio}`);
}

// Las tres funciones "efectivo" reciben [mensaje, ...anteriores] (la más reciente primero). Un mensaje que
// no es seguimiento devuelve lo que dice solo; un seguimiento completa lo que falta con el contexto
// efectivo de la pregunta anterior, que se calcula igual (por eso una pregunta completa corta la cadena).

function periodoEfectivo(lista, ahora) {
  const [mensaje, ...anteriores] = lista;
  const actual = detectarPeriodo(mensaje, ahora);
  const t = normalizar(mensaje);
  if (!esSeguimiento(mensaje) || PERIODO_RELATIVO.test(t)) return actual;

  // Semana o mes sin año ("y en la SE 10?", "y en marzo?"): el detector base completaría con el año
  // actual (o con nada); aquí el año es el de la pregunta anterior.
  const sinAnio = !REGEX_ANIO.test(t) && (REGEX_SEMANA.test(t) || REGEX_MES.test(t));
  if (!sinAnio && tienePeriodo(actual)) return actual;
  if (anteriores.length === 0) return actual;

  const previo = periodoEfectivo(anteriores, ahora);
  if (sinAnio) {
    if (previo.anio !== null && previo.anio !== undefined) {
      const conAnio = detectarPeriodo(ponerAnio(mensaje, previo.anio), ahora);
      if (tienePeriodo(conAnio) && conAnio.anio === previo.anio) {
        return { ...conAnio, criterio_usado: `${conAnio.criterio_usado} (año tomado de la pregunta anterior)`, heredado: true };
      }
    }
    return actual;
  }
  if (tienePeriodo(previo)) {
    const criterio = previo.heredado ? previo.criterio_usado : `${previo.criterio_usado} (tomado de la pregunta anterior)`;
    return { ...previo, criterio_usado: criterio, heredado: true };
  }
  return actual;
}

function departamentoEfectivo(lista) {
  const [mensaje, ...anteriores] = lista;
  const actual = detectarDepartamento(mensaje);
  if (actual.codigo_departamento || !esSeguimiento(mensaje) || ALCANCE_NACIONAL.test(normalizar(mensaje))) return actual;
  if (anteriores.length === 0) return actual;
  const previo = departamentoEfectivo(anteriores);
  return previo.codigo_departamento ? { ...previo, heredado: true } : actual;
}

function enfermedadEfectiva(lista) {
  const [mensaje, ...anteriores] = lista;
  const actual = detectarEnfermedad(mensaje);
  if (tieneEnfermedad(actual) || !esSeguimiento(mensaje) || ALCANCE_ENFERMEDADES.test(normalizar(mensaje))) return actual;
  if (anteriores.length === 0) return actual;
  const previo = enfermedadEfectiva(anteriores);
  if (!tieneEnfermedad(previo)) return actual;
  const criterio = previo.heredado ? previo.criterio_enfermedad : `${previo.criterio_enfermedad} (tomada de la pregunta anterior)`;
  return { ...previo, criterio_enfermedad: criterio, heredado: true };
}

/**
 * detectarPeriodo con herencia: si el mensaje nuevo es un seguimiento y no trae período, usa el de la
 * pregunta anterior (se agrega `heredado: true` y el criterio lo dice). Un período relativo ("últimas
 * semanas", "hoy") no se hereda. Semana o mes sin año toman el año de la pregunta anterior.
 *
 * @param {string} pregunta
 * @param {string[]} [previas] - preguntas anteriores del usuario, la más reciente primero
 * @param {Date} [ahora] - momento de referencia para lo relativo (solo se inyecta en pruebas)
 * @returns {object} lo mismo que detectarPeriodo
 */
function detectarPeriodoConHistorial(pregunta, previas, ahora) {
  return periodoEfectivo([pregunta, ...preguntasPrevias(previas)], ahora);
}

/**
 * detectarDepartamento con herencia: seguimiento sin departamento (y sin pedir otro alcance) →
 * el de la pregunta anterior.
 *
 * @param {string} pregunta
 * @param {string[]} [previas]
 * @returns {{ departamento_detectado: string|null, codigo_departamento: string|null, heredado?: boolean }}
 */
function detectarDepartamentoConHistorial(pregunta, previas) {
  return departamentoEfectivo([pregunta, ...preguntasPrevias(previas)]);
}

/**
 * detectarEnfermedad con herencia: seguimiento que no nombra enfermedad (ni pide todas) → la de la
 * pregunta anterior. Si ninguna la nombra, queda el comportamiento de siempre (las 4 fuentes).
 *
 * @param {string} pregunta
 * @param {string[]} [previas]
 * @returns {object} lo mismo que detectarEnfermedad
 */
function detectarEnfermedadConHistorial(pregunta, previas) {
  return enfermedadEfectiva([pregunta, ...preguntasPrevias(previas)]);
}

module.exports = {
  esSeguimiento,
  preguntasPrevias,
  detectarPeriodoConHistorial,
  detectarDepartamentoConHistorial,
  detectarEnfermedadConHistorial,
  MAX_PREVIAS,
};
