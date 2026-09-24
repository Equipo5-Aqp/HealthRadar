// @healthradar/core — parsers/periodo.js
// ─────────────────────────────────────────────────────────
// Detecta a qué periodo (año + rango de semanas epidemiológicas) se refiere
// la pregunta del analista, SIN usar ningún modelo de IA (cero tokens).
//
// Extraído del nodo "Detectar periodo en la pregunta" + "Resolver ventana
// por defecto (si aplica)" del workflow NLQ (Conexion posgrest.json).

'use strict';

const MESES = {
  'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
  'julio': 7, 'agosto': 8, 'septiembre': 9, 'setiembre': 9, 'octubre': 10,
  'noviembre': 11, 'diciembre': 12,
};

/**
 * Calcula (año, semana) epidemiológica DGE para una fecha dada.
 * Regla DGE: semana domingo–sábado; SE 01 = la que contiene el 4 de enero.
 * Replica exactamente la lógica de fn_semana_epi_dge() de la migración 007.
 */
function getSemanaEpi(fechaStr) {
  const fecha = new Date(fechaStr);
  const dom = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  dom.setUTCDate(dom.getUTCDate() - dom.getUTCDay());
  const mie = new Date(dom);
  mie.setUTCDate(dom.getUTCDate() + 3);
  const anio = mie.getUTCFullYear();
  const jan4 = new Date(Date.UTC(anio, 0, 4));
  const domSE1 = new Date(jan4);
  domSE1.setUTCDate(jan4.getUTCDate() - jan4.getUTCDay());
  const semana = Math.round((dom - domSE1) / (7 * 86400000)) + 1;
  return { anio, semana };
}

function rangoSemanasDeMes(anio, mes) {
  const primerDia = new Date(Date.UTC(anio, mes - 1, 1));
  const ultimoDia = new Date(Date.UTC(anio, mes, 0));
  const inicio = getSemanaEpi(primerDia.toISOString());
  const fin = getSemanaEpi(ultimoDia.toISOString());
  return { anio: inicio.anio, semanaInicio: inicio.semana, semanaFin: fin.semana };
}

/**
 * Detecta a qué periodo se refiere la pregunta del analista.
 *
 * @param {string} pregunta - Texto en lenguaje natural del analista
 * @returns {{ anio: number|null, semana_desde: number|null, semana_hasta: number|null,
 *             ventana_por_defecto?: number, criterio_usado: string }}
 */
function detectarPeriodo(pregunta) {
  const texto = (pregunta || '').toLowerCase();

  // 1. Rango "entre <mes1> y <mes2> de <año>"
  const regexRango = new RegExp(
    `entre\\s+(${Object.keys(MESES).join('|')})\\s+y\\s+(${Object.keys(MESES).join('|')})\\s+(?:de\\s+)?(\\d{4})`,
    'i'
  );
  const matchRango = texto.match(regexRango);
  if (matchRango) {
    const [, mes1Str, mes2Str, anioStr] = matchRango;
    const anio = Number(anioStr);
    const r1 = rangoSemanasDeMes(anio, MESES[mes1Str]);
    const r2 = rangoSemanasDeMes(anio, MESES[mes2Str]);
    return {
      anio,
      semana_desde: Math.min(r1.semanaInicio, r2.semanaInicio),
      semana_hasta: Math.max(r1.semanaFin, r2.semanaFin),
      criterio_usado: `rango: ${mes1Str} a ${mes2Str} ${anio}`,
    };
  }

  // 2. "SEMANA N" o "SE N" explícita
  const regexSemana = /(?:semana|se)\s*(\d{1,2})(?:\s*-?\s*(\d{4}))?/i;
  const matchSemana = texto.match(regexSemana);
  if (matchSemana) {
    const semana = Number(matchSemana[1]);
    const anio = matchSemana[2] ? Number(matchSemana[2]) : new Date().getFullYear();
    return {
      anio,
      semana_desde: semana,
      semana_hasta: semana,
      criterio_usado: `semana especifica: SE ${semana}-${anio}`,
    };
  }

  // 3. "<mes> de <año>" o "<mes> <año>"
  const regexMes = new RegExp(`(${Object.keys(MESES).join('|')})\\s+(?:de\\s+)?(\\d{4})`, 'i');
  const matchMes = texto.match(regexMes);
  if (matchMes) {
    const [, mesStr, anioStr] = matchMes;
    const anio = Number(anioStr);
    const r = rangoSemanasDeMes(anio, MESES[mesStr]);
    return {
      anio,
      semana_desde: r.semanaInicio,
      semana_hasta: r.semanaFin,
      criterio_usado: `mes especifico: ${mesStr} ${anio}`,
    };
  }

  // 3.5. Solo "el año AAAA" o "en AAAA"
  const regexAnioSolo = /\b(?:en el a[nñ]o|durante(?:\s+el)?(?:\s+a[nñ]o)?|del a[nñ]o|a[nñ]o|en|para|de|del)\s+(\d{4})\b/i;
  const matchAnioSolo = texto.match(regexAnioSolo);
  if (matchAnioSolo) {
    const anio = Number(matchAnioSolo[1]);
    return {
      anio,
      semana_desde: 1,
      semana_hasta: 53,
      criterio_usado: `anio completo: ${anio}`,
    };
  }

  // 3.6. Cualquier año 4 dígitos suelto (2010-2029)
  const regexAnioSuelto = /\b(20[1-2]\d)\b/;
  const matchAnioSuelto = texto.match(regexAnioSuelto);
  if (matchAnioSuelto) {
    const anio = Number(matchAnioSuelto[1]);
    return {
      anio,
      semana_desde: 1,
      semana_hasta: 53,
      criterio_usado: `anio completo (deteccion generica): ${anio}`,
    };
  }

  // 4. Nada detectado: ventana por defecto (últimas 12 semanas)
  return {
    anio: null,
    semana_desde: null,
    semana_hasta: null,
    ventana_por_defecto: 12,
    criterio_usado: 'sin periodo detectado: se usara ventana de las ultimas 12 semanas',
  };
}

/**
 * Auxiliar: verifica si un resumen de boletín es un texto real.
 */
function tieneResumenReal(resumen) {
  if (!resumen) return false;
  const texto = resumen.toString().trim().toLowerCase();
  if (texto.length === 0) return false;
  if (texto === 'empty' || texto === 'null' || texto === 'undefined') return false;
  return true;
}

/**
 * Si detectarPeriodo no encontró periodo explícito, calcula la ventana de las
 * últimas N semanas usando la semana más reciente con resumen generado.
 *
 * @param {object} deteccion - Output de detectarPeriodo
 * @param {Array<{anio: number, semana_epidemiologica: number, resumen: string}>} boletines
 * @returns {{ anio, semana_desde, semana_hasta, anio_desde?, anio_hasta?, criterio_usado }}
 */
function resolverVentana(deteccion, boletines) {
  // Auxiliar para detectar valores nulos (viene de n8n como string a veces)
  function esNulo(valor) {
    return valor === null || valor === undefined || valor === 'null' || valor === '';
  }

  if (!esNulo(deteccion.anio)) {
    // Ya se detectó un periodo explícito, se pasa tal cual.
    return deteccion;
  }

  const conResumen = (boletines || []).filter(f => tieneResumenReal(f.resumen));

  if (conResumen.length === 0) {
    throw new Error('No hay ningun boletin con resumen generado todavia en boletines_descubiertos.');
  }

  const masReciente = conResumen.reduce((max, f) => {
    if (f.anio > max.anio) return f;
    if (f.anio === max.anio && f.semana_epidemiologica > max.semana_epidemiologica) return f;
    return max;
  }, conResumen[0]);

  const N = deteccion.ventana_por_defecto || 12;
  const anio = masReciente.anio;
  const semana = masReciente.semana_epidemiologica;
  const semanasDelAnioAnterior = 52;

  let semanaDesdeAnio = anio;
  let semanaDesde = semana - (N - 1);
  if (semanaDesde < 1) {
    semanaDesdeAnio = anio - 1;
    semanaDesde = semanasDelAnioAnterior + semanaDesde;
  }

  return {
    anio: null,
    semana_desde: semanaDesde,
    semana_hasta: semana,
    anio_desde: semanaDesdeAnio,
    anio_hasta: anio,
    criterio_usado: `ventana por defecto: ultimas ${N} semanas hasta SE ${semana}-${anio}`,
  };
}

module.exports = {
  detectarPeriodo,
  resolverVentana,
  // Exports internos para testing
  _internal: { getSemanaEpi, rangoSemanasDeMes, tieneResumenReal, MESES },
};
