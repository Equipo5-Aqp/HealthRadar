// @healthradar/core — parsers/seguimiento.js
// ─────────────────────────────────────────────────────────
// Preguntas de seguimiento ("¿y en Piura?"): los detectores (período, departamento, enfermedad) leen
// solo el mensaje nuevo, así que un seguimiento sin período caía en "las últimas 12 semanas" aunque la
// pregunta anterior fuera de otra semana. Estas funciones completan lo que FALTA en el mensaje nuevo con
// lo que dijo el usuario en sus preguntas anteriores de la misma conversación. Lo que el mensaje nuevo
// SÍ dice siempre manda; sin historial o sin seguimiento devuelven exactamente lo que el detector base.
//
// Sin LLM y sin red: solo regex sobre los textos.

'use strict';

const { detectarPeriodo } = require('./periodo');
const { detectarDepartamento } = require('./departamento');
const { detectarEnfermedad } = require('./enfermedad');

/** Cuántas preguntas anteriores se miran como máximo (la más reciente primero). */
const MAX_PREVIAS = 4;

/** Una pregunta con preposición al inicio solo se considera seguimiento si es corta ("en Piura", "en la SE 10 de 2026"). */
const MAX_PALABRAS_ELIPTICA = 7;

const sinTildes = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Minúsculas, sin tildes ni signos, espacios simples. */
function normalizar(texto) {
  return sinTildes(typeof texto === 'string' ? texto : '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// «y en Piura», «también en Lima», «ahora en 2024»
const INICIO_ELIPTICO = /^(y|e|o|tambien|ademas|igual|pero|entonces|ahora)\b/;
// «lo mismo», «ahí», «en esas semanas», «ese departamento»…
const REFERENCIA = /\b(lo mismo|igual que|ahi|alli|ese periodo|esa semana|esas semanas|ese ano|ese departamento|esos departamentos|esa fecha|esas fechas|mismo periodo|misma semana|mismas semanas|mismo departamento|mismos departamentos|misma fecha|mismas fechas)\b/;
const PREPOSICION_INICIAL = /^(en|de|del|para|con|sobre|a)\b/;

// Si el usuario pide el panorama nacional o "por departamento", no se le pega el departamento anterior.
const ALCANCE_NACIONAL = /\b(nacional|todo el pais|todo el peru|todos los departamentos|cada departamento|por departamento|que departamentos|cuales departamentos|en que departamento)\b/;

/**
 * ¿Parece un seguimiento de lo anterior? Conservador: una pregunta completa e independiente
 * ("Dime los casos de la SE 12 de 2025") NO hereda nada, aunque venga después de otras.
 *
 * @param {string} pregunta
 * @returns {boolean}
 */
function esSeguimiento(pregunta) {
  const t = normalizar(pregunta);
  if (t === '') return false;
  if (INICIO_ELIPTICO.test(t)) return true;
  if (REFERENCIA.test(t)) return true;
  return PREPOSICION_INICIAL.test(t) && t.split(' ').length <= MAX_PALABRAS_ELIPTICA;
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

/**
 * detectarPeriodo con herencia: si el mensaje nuevo es un seguimiento y no trae período, usa el de la
 * pregunta anterior más reciente que lo tenga (se agrega `heredado: true` y el criterio lo dice).
 *
 * @param {string} pregunta
 * @param {string[]} [previas] - preguntas anteriores del usuario, la más reciente primero
 * @returns {object} lo mismo que detectarPeriodo
 */
function detectarPeriodoConHistorial(pregunta, previas) {
  const actual = detectarPeriodo(pregunta);
  if (tienePeriodo(actual) || !esSeguimiento(pregunta)) return actual;
  for (const previa of preguntasPrevias(previas)) {
    const p = detectarPeriodo(previa);
    if (tienePeriodo(p)) {
      return { ...p, criterio_usado: `${p.criterio_usado} (tomado de la pregunta anterior)`, heredado: true };
    }
  }
  return actual;
}

/**
 * detectarDepartamento con herencia: seguimiento sin departamento (y sin pedir el alcance nacional) →
 * el de la pregunta anterior más reciente que lo nombre.
 *
 * @param {string} pregunta
 * @param {string[]} [previas]
 * @returns {{ departamento_detectado: string|null, codigo_departamento: string|null, heredado?: boolean }}
 */
function detectarDepartamentoConHistorial(pregunta, previas) {
  const actual = detectarDepartamento(pregunta);
  if (actual.codigo_departamento || !esSeguimiento(pregunta) || ALCANCE_NACIONAL.test(normalizar(pregunta))) return actual;
  for (const previa of preguntasPrevias(previas)) {
    const d = detectarDepartamento(previa);
    if (d.codigo_departamento) return { ...d, heredado: true };
  }
  return actual;
}

/**
 * detectarEnfermedad con herencia: seguimiento que no nombra enfermedad → la de la pregunta anterior
 * más reciente que la nombre. Si ninguna la nombra, queda el comportamiento de siempre (las 4 fuentes).
 *
 * @param {string} pregunta
 * @param {string[]} [previas]
 * @returns {object} lo mismo que detectarEnfermedad
 */
function detectarEnfermedadConHistorial(pregunta, previas) {
  const actual = detectarEnfermedad(pregunta);
  if (tieneEnfermedad(actual) || !esSeguimiento(pregunta)) return actual;
  for (const previa of preguntasPrevias(previas)) {
    const e = detectarEnfermedad(previa);
    if (tieneEnfermedad(e)) {
      return { ...e, criterio_enfermedad: `${e.criterio_enfermedad} (tomada de la pregunta anterior)`, heredado: true };
    }
  }
  return actual;
}

module.exports = {
  esSeguimiento,
  preguntasPrevias,
  detectarPeriodoConHistorial,
  detectarDepartamentoConHistorial,
  detectarEnfermedadConHistorial,
  MAX_PREVIAS,
};
