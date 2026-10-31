// @healthradar/core — builders/tendencia-boletines.js
// ─────────────────────────────────────────────────────────
// Sprint 4 (nivel de riesgo 2025 en adelante): arma el texto de tendencia a partir de los BOLETINES,
// con el mismo formato que armarTextoTendencia usa para los datos de Postgres (≤ 2024):
//
//   SE 18-2025: 120 casos
//
// Los boletines traen cifras ACUMULADAS del año ([CIFRAS: ...]); los casos de cada semana son la
// diferencia entre dos boletines consecutivos. Si no se puede calcular, devuelve '' y el modelo no
// recibe tendencia (y por lo tanto no escribe nivel de riesgo): nunca se inventan semanas.
//
// Puro: sin n8n, sin PostgreSQL, sin red.

'use strict';

const { extraerCifras } = require('../parsers/cifras-boletin');
const { casosSemanalesDesdeAcumulados } = require('../utils/casos-semanales');
const { tieneResumenReal } = require('../filters/boletines');

const SEMANAS_POR_DEFECTO = 6;
const MIN_SEMANAS = 3;

const aEntero = v => {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};

// Qué clave del marcador [CIFRAS: ...] usar para cada fuente de la pregunta.
function fuentesActivas(enfermedad) {
  const e = enfermedad || {};
  // Pregunta de otra enfermedad (malaria, sarampión, PFA...) sin mencionar dengue/EDA/IRA: no hay serie
  // para esa enfermedad, y mostrar la tendencia de las otras daría un nivel de riesgo que no corresponde.
  if (e.otra_enfermedad_mencionada && !e.enfermedad_especifica) return [];
  const fuentes = [];
  if (e.incluir_dengue) fuentes.push({ titulo: 'Dengue', clave: 'dengue_total' });
  if (e.incluir_eda) fuentes.push({ titulo: 'EDA (enfermedad diarreica aguda)', clave: 'eda_total' });
  if (e.incluir_ira_neumonia && e.incluir_ira_no_neumonia) {
    fuentes.push({ titulo: 'IRA (neumonia + no neumonia combinadas)', clave: 'ira_total' });
  } else if (e.incluir_ira_neumonia) {
    fuentes.push({ titulo: 'IRA - Neumonia (especifico, sin combinar con no-neumonia)', clave: 'ira_neumonias' });
  }
  return fuentes;
}

/**
 * Texto de tendencia semanal a partir de los boletines procesados.
 *
 * @param {Array<{anio:number|string, semana_epidemiologica?:number|string, semana?:number|string, resumen?:string}>} boletines
 *        TODOS los boletines procesados (no solo los del periodo): para restar hace falta el boletín anterior.
 * @param {{anio?:number|null, anio_hasta?:number|null, semana_hasta?:number|null}} periodo - salida de resolverVentana
 * @param {{incluir_dengue?:boolean, incluir_eda?:boolean, incluir_ira_neumonia?:boolean, incluir_ira_no_neumonia?:boolean}} enfermedad
 *        salida de detectarEnfermedad
 * @param {{semanas?:number}} [opciones] - cuántas semanas mostrar (por defecto 6)
 * @returns {string} texto consolidado, o '' si no hay al menos 3 semanas calculables de ninguna fuente
 */
function armarTextoTendenciaBoletines(boletines, periodo, enfermedad, opciones) {
  const semanas = Math.max(MIN_SEMANAS, Math.floor(Number(opciones && opciones.semanas)) || SEMANAS_POR_DEFECTO);

  // Cifras de cada boletín que trae el marcador.
  const cifras = [];
  for (const b of Array.isArray(boletines) ? boletines : []) {
    const anio = aEntero(b && b.anio);
    const semana = aEntero(b && (b.semana_epidemiologica !== undefined ? b.semana_epidemiologica : b.semana));
    if (Number.isNaN(anio) || Number.isNaN(semana)) continue;
    const r = extraerCifras(b.resumen);
    if (r) cifras.push({ anio, semana, cifras: r.cifras });
  }

  // Tope: hasta el final del periodo consultado (si se conoce).
  const p = periodo || {};
  const anioFin = aEntero(p.anio !== null && p.anio !== undefined && p.anio !== 'null' ? p.anio : p.anio_hasta);
  const semanaFin = aEntero(p.semana_hasta);
  const dentro = c => Number.isNaN(anioFin)
    || c.anio < anioFin
    || (c.anio === anioFin && (Number.isNaN(semanaFin) || c.semana <= semanaFin));

  // El periodo consultado tiene que estar cubierto por los boletines publicados: si empieza después del
  // último boletín (p. ej. se pregunta por 2026 y solo hay boletines de 2025), no hay tendencia del periodo
  // y no se muestra la de semanas anteriores como si lo fuera. Cuenta cualquier boletín con resumen, tenga
  // o no cifras: las semanas pendientes de reproceso no cambian que el periodo ya esté publicado.
  const anioIni = aEntero(p.anio !== null && p.anio !== undefined && p.anio !== 'null' ? p.anio : p.anio_desde);
  const semanaIni = aEntero(p.semana_desde);
  if (!Number.isNaN(anioIni) && !Number.isNaN(semanaIni)) {
    const claveInicio = anioIni * 100 + semanaIni;
    let ultimoPublicado = null;
    for (const b of Array.isArray(boletines) ? boletines : []) {
      const anio = aEntero(b && b.anio);
      const semana = aEntero(b && (b.semana_epidemiologica !== undefined ? b.semana_epidemiologica : b.semana));
      if (Number.isNaN(anio) || Number.isNaN(semana) || !tieneResumenReal(b.resumen)) continue;
      if (ultimoPublicado === null || anio * 100 + semana > ultimoPublicado) ultimoPublicado = anio * 100 + semana;
    }
    if (ultimoPublicado === null || claveInicio > ultimoPublicado) return '';
  }

  const bloques = [];
  for (const f of fuentesActivas(enfermedad)) {
    const acumulados = cifras.filter(dentro).map(c => ({
      anio: c.anio,
      semana: c.semana,
      acumulado: typeof c.cifras[f.clave] === 'number' ? c.cifras[f.clave] : null,
    }));
    const ultimas = casosSemanalesDesdeAcumulados(acumulados)
      .filter(s => s.casos !== null)
      .slice(-semanas);
    if (ultimas.length < MIN_SEMANAS) continue;

    let texto = `Tendencia historica de casos de ${f.titulo} a nivel nacional `
      + '(los boletines no traen cifras por departamento; casos de cada semana = diferencia entre los '
      + 'acumulados de boletines consecutivos, datos de boletines 2025 en adelante):\n';
    for (const s of ultimas) texto += `SE ${s.semana}-${s.anio}: ${s.casos} casos\n`;
    bloques.push(texto.trimEnd());
  }
  return bloques.join('\n\n');
}

module.exports = { armarTextoTendenciaBoletines, SEMANAS_POR_DEFECTO, MIN_SEMANAS };
