// @healthradar/core — builders/contexto-prompt.js
// ─────────────────────────────────────────────────────────
// Arma un único bloque de texto consolidado con boletines + clima del periodo,
// listo para inyectar en el prompt del AI Agent.
// Extraído del nodo "Consolidar boletines + clima del periodo" del workflow NLQ.

'use strict';

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
  for (const b of boletinesOrdenados) {
    textoBoletines += `\n--- Boletin SE ${b.semana_epidemiologica}-${b.anio} ---\n${b.resumen}\n`;
  }

  // Promedio nacional de clima por semana (agrupando los 25 departamentos)
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
    climaPorSemana[key].temp_max.push(c.temp_max_promedio);
    climaPorSemana[key].temp_min.push(c.temp_min_promedio);
    climaPorSemana[key].precipitacion.push(c.precipitacion_total);
  }

  const promedio = arr => (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);

  let textoClima = '';
  const semanasClima = Object.values(climaPorSemana)
    .sort((a, b) => (a.anio - b.anio) || (a.semana - b.semana));
  for (const s of semanasClima) {
    textoClima += `SE ${s.semana}-${s.anio}: temp. max promedio nacional ${promedio(s.temp_max)}°C, temp. min promedio ${promedio(s.temp_min)}°C, precipitacion promedio ${promedio(s.precipitacion)}mm\n`;
  }

  return {
    texto_boletines: textoBoletines.trim(),
    texto_tendencia: textoTendencia || '',
    texto_clima: textoClima.trim(),
    criterio_periodo: periodo.criterio_usado,
    cantidad_boletines: boletinesOrdenados.length,
  };
}

module.exports = { construirContextoPrompt };
