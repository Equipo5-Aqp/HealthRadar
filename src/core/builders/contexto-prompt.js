// @healthradar/core — builders/contexto-prompt.js
// ─────────────────────────────────────────────────────────
// Arma un único bloque de texto consolidado con boletines + clima del periodo,
// listo para inyectar en el prompt del AI Agent.
// Extraído del nodo "Consolidar boletines + clima del periodo" del workflow NLQ.

'use strict';

const { quitarMarcadorCifras } = require('../parsers/cifras-boletin');

/** Agrega v al arreglo solo si es un número válido (acepta texto numérico; ignora null, '' y NaN). */
function agregarNumero(arr, v) {
  if (v === null || v === undefined || v === '') return;
  const n = Number(v);
  if (Number.isFinite(n)) arr.push(n);
}

// Hasta 2 años de semanas (2 × 53) se muestra cada semana; con más se resume por año.
const MAX_SEMANAS_CLIMA_DETALLE = 106;

/** Promedio numérico de un arreglo de números (null si está vacío). */
function mediaNumerica(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}

/**
 * Una línea por año: promedio de los promedios semanales nacionales (ignora las semanas sin dato).
 * @param {Array<{anio:number|string, temp_max:number[], temp_min:number[], precipitacion:number[]}>} semanas - ordenadas
 */
function climaPorAnio(semanas) {
  const porAnio = new Map();
  for (const s of semanas) {
    const a = porAnio.get(s.anio) || { tmax: [], tmin: [], prec: [], semanas: 0 };
    a.semanas += 1;
    for (const [dest, origen] of [[a.tmax, s.temp_max], [a.tmin, s.temp_min], [a.prec, s.precipitacion]]) {
      const m = mediaNumerica(origen);
      if (m !== null) dest.push(m);
    }
    porAnio.set(s.anio, a);
  }
  const valor = (v, unidad) => (v === null ? 'sin dato' : `${v.toFixed(1)}${unidad}`);
  let texto = '';
  for (const [anio, a] of porAnio) {
    texto += `Anio ${anio} (promedio de ${a.semanas} semanas): temp. max promedio nacional ${valor(mediaNumerica(a.tmax), '°C')}, temp. min promedio ${valor(mediaNumerica(a.tmin), '°C')}, precipitacion semanal promedio ${valor(mediaNumerica(a.prec), 'mm')}\n`;
  }
  return texto;
}

/**
 * Aviso que reemplaza a los resúmenes cuando el periodo no tiene boletines con resumen.
 * Va en texto_boletines, así lo reciben igual el core (Kimi/GLM) y los agentes de Gemini.
 */
function avisoSinBoletines(criterio) {
  const periodo = criterio ? ' (' + criterio + ')' : '';
  return 'No hay boletin epidemiologico con resumen disponible para este periodo' + periodo + '. ' +
    'No inventes contenido de boletines: usa solo los datos de clima y tendencia incluidos mas abajo, ' +
    'y si no alcanzan para responder, di claramente que no hay boletin disponible para ese periodo.';
}

/**
 * Construye el contexto textual consolidado para el prompt del AI Agent.
 *
 * @param {Array<{anio: number, semana_epidemiologica: number, resumen: string}>} boletines
 * @param {Array<{anio: number, semana_epidemiologica: number, temp_max_promedio, temp_min_promedio, precipitacion_total}>} clima
 * @param {object} periodo - Output de resolverVentana (con criterio_usado)
 * @param {string} textoTendencia - Texto de tendencia ya armado (puede ser '')
 * @returns {{ texto_boletines: string, texto_tendencia: string, texto_clima: string,
 *             criterio_periodo: string, cantidad_boletines: number }}
 */
function construirContextoPrompt(boletines, clima, periodo, textoTendencia) {
  // Ordenar boletines cronológicamente
  const boletinesOrdenados = [...(boletines || [])].sort((a, b) => {
    if (a.anio !== b.anio) return a.anio - b.anio;
    return a.semana_epidemiologica - b.semana_epidemiologica;
  });

  // Texto de boletines
  let textoBoletines = '';
  if (boletinesOrdenados.length === 0) {
    // Sin boletín para el periodo (años < 2025, o semana aún no procesada): se le dice al modelo
    // de forma explícita para que no invente contenido de boletines ni calle el hecho.
    textoBoletines = avisoSinBoletines(periodo && periodo.criterio_usado);
  }
  for (const b of boletinesOrdenados) {
    textoBoletines += `\n--- Boletin SE ${b.semana_epidemiologica}-${b.anio} ---\n${quitarMarcadorCifras(b.resumen)}\n`;
  }

  // Promedio nacional de clima por semana (agrupando los 25 departamentos).
  // Postgres entrega NUMERIC como texto ('23.10') y las semanas sin dato como null:
  // se convierte a número y se ignoran los vacíos. Sin esto el promedio daba NaN
  // (texto concatenado) o quedaba subestimado (null contado como 0).
  const climaPorSemana = {};
  for (const c of (clima || [])) {
    const key = `${c.anio}-${c.semana_epidemiologica}`;
    if (!climaPorSemana[key]) {
      climaPorSemana[key] = {
        anio: c.anio,
        semana: c.semana_epidemiologica,
        temp_max: [],
        temp_min: [],
        precipitacion: [],
      };
    }
    agregarNumero(climaPorSemana[key].temp_max, c.temp_max_promedio);
    agregarNumero(climaPorSemana[key].temp_min, c.temp_min_promedio);
    agregarNumero(climaPorSemana[key].precipitacion, c.precipitacion_total);
  }

  const promedio = arr => (arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null);
  const valor = (v, unidad) => (v === null ? 'sin dato' : `${v}${unidad}`);

  let textoClima = '';
  const semanasClima = Object.values(climaPorSemana)
    .sort((a, b) => (a.anio - b.anio) || (a.semana - b.semana));
  if (semanasClima.length > MAX_SEMANAS_CLIMA_DETALLE) {
    // Periodo de más de 2 años (p. ej. "de 2015 a 2024"): una línea por año en vez de una por semana,
    // para que el mensaje al modelo no crezca sin límite.
    textoClima = climaPorAnio(semanasClima);
  } else {
    for (const s of semanasClima) {
      textoClima += `SE ${s.semana}-${s.anio}: temp. max promedio nacional ${valor(promedio(s.temp_max), '°C')}, temp. min promedio ${valor(promedio(s.temp_min), '°C')}, precipitacion promedio ${valor(promedio(s.precipitacion), 'mm')}\n`;
    }
  }

  return {
    texto_boletines: textoBoletines.trim(),
    texto_tendencia: textoTendencia || '',
    texto_clima: textoClima.trim(),
    criterio_periodo: periodo.criterio_usado,
    cantidad_boletines: boletinesOrdenados.length,
  };
}

module.exports = { construirContextoPrompt, avisoSinBoletines };
