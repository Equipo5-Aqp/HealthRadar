// @healthradar/core — builders/riesgo-panorama.js
// ─────────────────────────────────────────────────────────
// Sprint 4 · HU2 (mostrar riesgo en el Panorama): nivel de riesgo NACIONAL calculado por código,
// sin LLM, a partir de las cifras acumuladas del marcador [CIFRAS: ...] de los boletines.
//
// Regla (por enfermedad: dengue, IRA, EDA):
//   1. Casos de cada semana = diferencia entre los acumulados de boletines consecutivos
//      (misma serie que usa HU1 para el chat).
//   2. Hacen falta 6 semanas CONSECUTIVAS calculables que terminen en la semana del boletín mostrado.
//      Si falta una semana, o un acumulado bajó (corrección del boletín), esa enfermedad no se evalúa.
//   3. Variación = promedio de las 3 últimas semanas / promedio de las 3 anteriores − 1.
//      Si el promedio de las 3 anteriores es menor a 10 casos por semana, no hay base para comparar.
//   4. alto: variación ≥ +20 %  ·  medio: ≥ +5 %  ·  bajo: menos que eso (estable o en descenso).
//   5. El nivel del Panorama es el más alto de las enfermedades evaluadas (empate: la de mayor variación).
//
// Si ninguna enfermedad se puede evaluar devuelve null: no se inventa un nivel.
// Puro: sin n8n, sin PostgreSQL, sin red.

'use strict';

const { extraerCifras } = require('../parsers/cifras-boletin');
const { casosSemanalesDesdeAcumulados } = require('../utils/casos-semanales');

const SEMANAS_POR_TRAMO = 3;
const UMBRAL_ALTO = 0.20;
const UMBRAL_MEDIO = 0.05;
const MIN_PROMEDIO_PREVIO = 10;

const FUENTES = [
  { id: 'dengue', nombre: 'Dengue', clave: 'dengue_total' },
  { id: 'ira', nombre: 'IRA', clave: 'ira_total' },
  { id: 'eda', nombre: 'EDA', clave: 'eda_total' },
];
const ORDEN_NIVEL = { bajo: 0, medio: 1, alto: 2 };

const aEntero = v => {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};
const promedio = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

// ¿b es la semana siguiente a a? (incluye el cambio de año: SE 52 o 53 → SE 1)
function sonConsecutivas(a, b) {
  if (a.anio === b.anio) return b.semana === a.semana + 1;
  return b.anio === a.anio + 1 && b.semana === 1 && (a.semana === 52 || a.semana === 53);
}

function nivelPorVariacion(v) {
  if (v >= UMBRAL_ALTO) return 'alto';
  if (v >= UMBRAL_MEDIO) return 'medio';
  return 'bajo';
}

function etiquetaSemanas(desde, hasta) {
  if (desde.anio === hasta.anio) return `SE ${desde.semana}-${hasta.semana}`;
  return `SE ${desde.semana}/${desde.anio}-${hasta.semana}/${hasta.anio}`;
}

// Evalúa UNA enfermedad. Devuelve { ok: true, ... } o { ok: false, motivo }.
function evaluarFuente(cifrasPorBoletin, fuente, tope) {
  const acumulados = cifrasPorBoletin
    .filter(c => c.anio < tope.anio || (c.anio === tope.anio && c.semana <= tope.semana))
    .map(c => ({
      anio: c.anio,
      semana: c.semana,
      acumulado: typeof c.cifras[fuente.clave] === 'number' ? c.cifras[fuente.clave] : null,
    }));
  const semanales = casosSemanalesDesdeAcumulados(acumulados);
  const n = SEMANAS_POR_TRAMO * 2;
  const ultimas = semanales.slice(-n);

  if (ultimas.length < n) return { ok: false, motivo: 'pocas_semanas' };
  const fin = ultimas[n - 1];
  if (fin.anio !== tope.anio || fin.semana !== tope.semana) return { ok: false, motivo: 'no_llega_al_boletin' };
  for (let i = 0; i < n; i++) {
    if (ultimas[i].casos === null) return { ok: false, motivo: 'semana_no_calculable' };
    if (i > 0 && !sonConsecutivas(ultimas[i - 1], ultimas[i])) return { ok: false, motivo: 'semanas_no_consecutivas' };
  }

  const previas = ultimas.slice(0, SEMANAS_POR_TRAMO);
  const recientes = ultimas.slice(SEMANAS_POR_TRAMO);
  const mediaPrevia = promedio(previas.map(s => s.casos));
  const mediaReciente = promedio(recientes.map(s => s.casos));
  if (mediaPrevia < MIN_PROMEDIO_PREVIO) return { ok: false, motivo: 'base_baja' };

  // Redondeo a 0,01 % para que un 20 % exacto no caiga en «medio» por error de coma flotante.
  const variacion = Math.round((mediaReciente / mediaPrevia - 1) * 10000) / 10000;
  return {
    ok: true,
    id: fuente.id,
    nombre: fuente.nombre,
    nivel: nivelPorVariacion(variacion),
    variacion,
    variacion_pct: Math.round(variacion * 100),
    recientes: { semanas: etiquetaSemanas(recientes[0], recientes[SEMANAS_POR_TRAMO - 1]), promedio: Math.round(mediaReciente) },
    previas: { semanas: etiquetaSemanas(previas[0], previas[SEMANAS_POR_TRAMO - 1]), promedio: Math.round(mediaPrevia) },
  };
}

function textoTendencia(pct) {
  if (pct >= UMBRAL_MEDIO * 100) return 'en aumento';
  if (pct <= -UMBRAL_MEDIO * 100) return 'en descenso';
  return 'estable';
}

/**
 * Nivel de riesgo nacional del Panorama.
 *
 * @param {Array<{anio:number|string, semana?:number|string, semana_epidemiologica?:number|string, resumen?:string}>} boletines
 *        Boletines procesados (cualquier orden). Hace falta el marcador [CIFRAS] en cada uno.
 * @param {{anio:number, semana:number}} tope - semana del boletín que muestra el Panorama
 * @returns {null | {
 *   nivel:'alto'|'medio'|'bajo', detalle:string, enfermedad:string, variacion_pct:number,
 *   por_enfermedad:Array<{id:string, nombre:string, nivel:string, variacion_pct:number,
 *                         recientes:{semanas:string, promedio:number}, previas:{semanas:string, promedio:number}}>,
 *   sin_datos:string[], alcance:'nacional', metodo:string }}
 */
function calcularRiesgoPanorama(boletines, tope) {
  const anioTope = aEntero(tope && tope.anio);
  const semanaTope = aEntero(tope && tope.semana);
  if (Number.isNaN(anioTope) || Number.isNaN(semanaTope)) return null;

  const cifrasPorBoletin = [];
  for (const b of Array.isArray(boletines) ? boletines : []) {
    const anio = aEntero(b && b.anio);
    const semana = aEntero(b && (b.semana_epidemiologica !== undefined ? b.semana_epidemiologica : b.semana));
    if (Number.isNaN(anio) || Number.isNaN(semana)) continue;
    const r = extraerCifras(b.resumen);
    if (r) cifrasPorBoletin.push({ anio, semana, cifras: r.cifras });
  }

  const evaluadas = [];
  const sinDatos = [];
  for (const f of FUENTES) {
    const r = evaluarFuente(cifrasPorBoletin, f, { anio: anioTope, semana: semanaTope });
    if (r.ok) evaluadas.push(r); else sinDatos.push(f.nombre);
  }
  if (evaluadas.length === 0) return null;

  const principal = evaluadas.reduce((mejor, e) => {
    const d = ORDEN_NIVEL[e.nivel] - ORDEN_NIVEL[mejor.nivel];
    return d > 0 || (d === 0 && e.variacion > mejor.variacion) ? e : mejor;
  });
  const signo = principal.variacion_pct > 0 ? '+' : '';
  const detalle = `${principal.nombre} ${textoTendencia(principal.variacion_pct)} (${signo}${principal.variacion_pct} %, `
    + `${principal.recientes.semanas} frente a ${principal.previas.semanas}). Nivel nacional.`;

  return {
    nivel: principal.nivel,
    detalle,
    enfermedad: principal.nombre,
    variacion_pct: principal.variacion_pct,
    por_enfermedad: evaluadas.map(e => ({
      id: e.id, nombre: e.nombre, nivel: e.nivel, variacion_pct: e.variacion_pct,
      recientes: e.recientes, previas: e.previas,
    })),
    sin_datos: sinDatos,
    alcance: 'nacional',
    metodo: 'promedio de las 3 últimas semanas frente a las 3 anteriores (alto ≥ +20 %, medio ≥ +5 %)',
  };
}

module.exports = {
  calcularRiesgoPanorama,
  SEMANAS_POR_TRAMO,
  UMBRAL_ALTO,
  UMBRAL_MEDIO,
  MIN_PROMEDIO_PREVIO,
};
