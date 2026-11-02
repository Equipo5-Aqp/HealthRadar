// @healthradar/core — builders/tendencia.js
// ─────────────────────────────────────────────────────────
// Consolida hasta 4 fuentes de tendencia histórica (Dengue, EDA, IRA neumonía,
// IRA no neumonía) en un solo texto para el prompt.
// Extraído del nodo "Armar texto de tendencia" del workflow NLQ.

'use strict';

const MAX_ANIOS_CON_DETALLE = 2; // preguntas de varios años: hasta aquí se muestra cada semana
const SEMANAS_FINALES = 6;       // con más años: solo las últimas semanas en detalle

/**
 * Total, máximo semanal y semana del máximo de cada año presente en las filas (ordenado por año).
 * El orden de las filas no importa; si hay varias semanas con el mismo máximo gana la primera.
 */
function resumenPorAnio(filas) {
  const porAnio = new Map();
  for (const f of filas) {
    const anio = Number(f.anio);
    const semana = Number(f.semana);
    const casos = Number(f.total_casos) || 0;
    if (!Number.isInteger(anio)) continue;
    const r = porAnio.get(anio) || { anio, total: 0, maximo: -1, semanaMaximo: null };
    r.total += casos;
    if (casos > r.maximo || (casos === r.maximo && semana < r.semanaMaximo)) {
      r.maximo = casos;
      r.semanaMaximo = semana;
    }
    porAnio.set(anio, r);
  }
  return [...porAnio.values()].sort((a, b) => a.anio - b.anio);
}

/**
 * Arma el texto de tendencia histórica a partir de las filas de Postgres.
 *
 * @param {object} decision - Output de decidirPrediccion
 * @param {Array<{enfermedad: string, anio: number, semana: number, total_casos: number,
 *                temp_max_promedio?, temp_min_promedio?, precipitacion_total?, humedad_promedio?}>} filas
 * @returns {string} Texto consolidado de tendencia ('' si predicción no activada)
 */
function armarTextoTendencia(decision, filas) {
  if (!decision || decision.activar_prediccion === false) {
    return '';
  }

  const todasLasFilas = filas || [];

  const filasDengue = todasLasFilas.filter(f => f.enfermedad === 'dengue');
  const filasEda = todasLasFilas.filter(f => f.enfermedad === 'eda');
  const filasIraNeu = todasLasFilas.filter(f => f.enfermedad === 'ira_neumonia');
  const filasIraNoNeu = todasLasFilas.filter(f => f.enfermedad === 'ira_no_neumonia');

  const esNacional = decision.nivel_agregacion === 'nacional';
  const ambitoTexto = esNacional
    ? 'a nivel nacional (suma de los 25 departamentos, ya que la pregunta no menciono un departamento especifico)'
    : `en ${decision.departamento_detectado}`;

  function climaTextoDe(f) {
    if (f.temp_max_promedio !== null && f.temp_max_promedio !== undefined) {
      return ` | clima ${esNacional ? 'promedio nacional' : ''}: temp max ${Number(f.temp_max_promedio).toFixed(1)}°C, temp min ${Number(f.temp_min_promedio).toFixed(1)}°C, precipitacion ${Number(f.precipitacion_total).toFixed(1)}mm, humedad ${Number(f.humedad_promedio).toFixed(1)}%`;
    }
    return ' | clima: sin dato disponible para esa semana';
  }

  function bloqueTexto(titulo, filasBloque) {
    if (filasBloque.length === 0) {
      return `${titulo} ${ambitoTexto}: no se encontraron casos historicos registrados en el periodo consultado (hasta 2024).\n`;
    }

    // Pregunta de varios años ("2023 y 2024"): total por año para poder comparar sin sumar semanas a ojo.
    // Hasta 2 años se conserva el detalle semanal; con 3 o más solo el resumen por año y las últimas
    // semanas, para que el texto no crezca sin límite (p. ej. "de 2015 a 2024").
    const resumen = decision.rango_anios === true ? resumenPorAnio(filasBloque) : [];
    if (resumen.length >= 2) {
      const conDetalle = resumen.length <= MAX_ANIOS_CON_DETALLE;
      const aviso = conDetalle
        ? ''
        : `; periodo de ${resumen.length} anios: se muestra el resumen por anio y las ultimas ${SEMANAS_FINALES} semanas`;
      let texto = `${titulo} ${ambitoTexto} (datos oficiales hasta 2024${aviso}):\n`;
      for (const f of conDetalle ? filasBloque : filasBloque.slice(-SEMANAS_FINALES)) {
        texto += `SE ${f.semana}-${f.anio}: ${f.total_casos} casos${climaTextoDe(f)}\n`;
      }
      texto += 'Resumen por anio:\n';
      for (const r of resumen) {
        texto += `${r.anio}: ${r.total} casos en el anio (maximo semanal: ${r.maximo} casos en la SE ${r.semanaMaximo}-${r.anio})\n`;
      }
      return texto;
    }

    let texto = `${titulo} ${ambitoTexto} (datos oficiales hasta 2024):\n`;
    for (const f of filasBloque) {
      texto += `SE ${f.semana}-${f.anio}: ${f.total_casos} casos${climaTextoDe(f)}\n`;
    }
    return texto;
  }

  const bloques = [];

  if (decision.incluir_dengue) {
    bloques.push(bloqueTexto('Tendencia historica de casos de Dengue', filasDengue));
  }

  if (decision.incluir_eda) {
    bloques.push(bloqueTexto('Tendencia historica de casos de EDA (enfermedad diarreica aguda)', filasEda));
  }

  // IRA: si ambas sub-fuentes están activas, combinar sumando por semana
  if (decision.incluir_ira_neumonia && decision.incluir_ira_no_neumonia) {
    const combinado = {};
    for (const f of [...filasIraNeu, ...filasIraNoNeu]) {
      const key = `${f.anio}-${f.semana}`;
      if (!combinado[key]) {
        combinado[key] = {
          anio: f.anio,
          semana: f.semana,
          total_casos: 0,
          temp_max_promedio: f.temp_max_promedio,
          temp_min_promedio: f.temp_min_promedio,
          precipitacion_total: f.precipitacion_total,
          humedad_promedio: f.humedad_promedio,
        };
      }
      combinado[key].total_casos += Number(f.total_casos) || 0;
    }
    const filasCombinadas = Object.values(combinado)
      .sort((a, b) => (a.anio - b.anio) || (a.semana - b.semana));
    bloques.push(bloqueTexto(
      'Tendencia historica de casos de IRA (neumonia + no neumonia combinadas)',
      filasCombinadas
    ));
  } else if (decision.incluir_ira_neumonia) {
    bloques.push(bloqueTexto(
      'Tendencia historica de casos de IRA - Neumonia (especifico, sin combinar con no-neumonia)',
      filasIraNeu
    ));
  } else if (decision.incluir_ira_no_neumonia) {
    bloques.push(bloqueTexto(
      'Tendencia historica de casos de IRA - No neumonia (especifico)',
      filasIraNoNeu
    ));
  }

  return bloques.join('\n').trim();
}

module.exports = { armarTextoTendencia };
