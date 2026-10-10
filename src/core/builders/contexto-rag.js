// @healthradar/core — builders/contexto-rag.js
// ─────────────────────────────────────────────────────────
// Búsqueda semántica (HU-3): arma el texto de "boletines relacionados con la pregunta"
// a partir de las filas que devuelve la consulta pgvector, y la lista de boletines que
// ya entran por el periodo (para no repetirlos).
//
// Funciones puras: sin HTTP ni base de datos. La llamada de embeddings y la consulta SQL
// viven en nodos de n8n; aquí solo se da forma al resultado.

'use strict';

const { quitarMarcadorCifras } = require('../parsers/cifras-boletin');

const MAX_CARACTERES_BOLETIN = 1500; // por boletín recuperado
const MAX_CARACTERES_TOTAL = 6000;   // tope del bloque completo (acota el prompt)

const aTexto = (v) => (v === undefined || v === null ? '' : String(v));
const esEntero = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isInteger(Number(v));

/** Recorta a `max` caracteres agregando '…' si hubo corte. */
function recortar(texto, max) {
  const t = aTexto(texto).trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(1, max - 1)).trimEnd() + '…';
}

/**
 * Clave numérica de un boletín: anio*100 + semana (2025, 9 → 202509).
 * @returns {number|null} null si anio o semana no son enteros válidos.
 */
function claveBoletin(anio, semana) {
  if (!esEntero(anio) || !esEntero(semana)) return null;
  return Number(anio) * 100 + Number(semana);
}

/**
 * Literal de arreglo Postgres ('{202509,202510}') con los boletines que YA están en el
 * contexto del periodo. Se pasa a la consulta como $n::int[] para no recuperarlos otra vez.
 * Entradas inválidas se ignoran; sin ninguna devuelve '{}' (arreglo vacío, no excluye nada).
 *
 * @param {Array<{anio:number, semana_epidemiologica:number}>} boletines
 * @returns {string}
 */
function construirExclusionBoletines(boletines) {
  const claves = [];
  for (const b of Array.isArray(boletines) ? boletines : []) {
    const k = b ? claveBoletin(b.anio, b.semana_epidemiologica) : null;
    if (k !== null && !claves.includes(k)) claves.push(k);
  }
  return '{' + claves.join(',') + '}';
}

/**
 * Da forma al contexto recuperado por similitud.
 *
 * @param {Array<{anio:number, semana_epidemiologica:number, resumen:string, distancia:number|string}>} filas
 *        Ya ordenadas por distancia ascendente (la consulta SQL las entrega así).
 * @param {{maxCaracteresBoletin?:number, maxCaracteresTotal?:number}} [opts]
 * @returns {{ texto_rag: string, cantidad: number,
 *             boletines: Array<{anio:number, semana:number, distancia:number|null}> }}
 *          texto_rag = '' si no hay nada que inyectar (el prompt entonces no cambia).
 */
function construirContextoRag(filas, opts = {}) {
  const porBoletin = Number.isFinite(opts.maxCaracteresBoletin) && opts.maxCaracteresBoletin > 0
    ? opts.maxCaracteresBoletin : MAX_CARACTERES_BOLETIN;
  const total = Number.isFinite(opts.maxCaracteresTotal) && opts.maxCaracteresTotal > 0
    ? opts.maxCaracteresTotal : MAX_CARACTERES_TOTAL;

  const bloques = [];
  const boletines = [];
  const vistos = new Set();
  let usado = 0;

  for (const f of Array.isArray(filas) ? filas : []) {
    if (!f) continue;
    const clave = claveBoletin(f.anio, f.semana_epidemiologica);
    if (clave === null || vistos.has(clave)) continue;
    const resumen = recortar(quitarMarcadorCifras(aTexto(f.resumen)), porBoletin);
    if (resumen === '') continue;

    const bloque = `--- Boletin SE ${Number(f.semana_epidemiologica)}-${Number(f.anio)} ---\n${resumen}`;
    if (bloques.length > 0 && usado + bloque.length + 1 > total) break; // el primero siempre entra
    vistos.add(clave);
    bloques.push(bloque);
    usado += bloque.length + 1;

    const d = Number(f.distancia);
    boletines.push({
      anio: Number(f.anio),
      semana: Number(f.semana_epidemiologica),
      distancia: f.distancia === null || f.distancia === undefined || f.distancia === '' || !Number.isFinite(d) ? null : d,
    });
  }

  return { texto_rag: bloques.join('\n'), cantidad: bloques.length, boletines };
}

module.exports = {
  construirContextoRag,
  construirExclusionBoletines,
  claveBoletin,
  MAX_CARACTERES_BOLETIN,
  MAX_CARACTERES_TOTAL,
};
