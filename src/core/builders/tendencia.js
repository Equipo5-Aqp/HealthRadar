// @healthradar/core — builders/tendencia.js
// ─────────────────────────────────────────────────────────
// Consolida hasta 4 fuentes de tendencia histórica (Dengue, EDA, IRA neumonía,
// IRA no neumonía) en un solo texto para el prompt.
// Extraído del nodo "Armar texto de tendencia" del workflow NLQ.

'use strict';

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
