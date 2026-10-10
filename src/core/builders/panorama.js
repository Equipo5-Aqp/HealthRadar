// @healthradar/core — builders/panorama.js
// ─────────────────────────────────────────────────────────
// Webhook /panorama (mf-dashboard): arma el panorama a partir de los resúmenes de boletines ya
// procesados en PostgreSQL. Las cifras salen del marcador [CIFRAS: ...] que valida Fase B; este
// código NO calcula ni estima nada: si una cifra no está, no se muestra.
// Puro: sin n8n, sin PostgreSQL, sin red.

'use strict';

const { extraerCifras, quitarMarcadorCifras } = require('../parsers/cifras-boletin');
const { calcularRangoFechasSemana } = require('./rango-semana');

// Claves de cifras que el panorama muestra (las demás del marcador se ignoran).
const CLAVES_PANORAMA = [
  'dengue_total', 'dengue_defunciones',
  'ira_total', 'ira_neumonias',
  'eda_total', 'eda_disentericas',
];
const ANIO_MIN = 2010;
const ANIO_MAX = 2100;
const MAX_ALERTAS = 3;
const MAX_LARGO_ALERTA = 280;

function aEntero(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v === 'string' && /^\d{1,4}$/.test(v.trim())) return Number(v.trim());
  return null;
}
const vacio = v => v === undefined || v === null || v === '';

/**
 * Valida el body del webhook /panorama (entrada NO confiable). Todo es opcional:
 * sin año ni semana se usa el boletín más reciente.
 * @returns {{ valido: boolean, error: string|null, filtros: {anio:number, semana:number}|null }}
 *          anio/semana: 0 = sin filtro. La semana exige el año.
 */
function validarFiltrosPanorama(body) {
  if (body === undefined || body === null) body = {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    return { valido: false, error: 'Cuerpo de la solicitud invalido', filtros: null };
  }
  let anio = 0;
  let semana = 0;
  if (!vacio(body.anio)) {
    const n = aEntero(body.anio);
    if (n === null || n < ANIO_MIN || n > ANIO_MAX) {
      return { valido: false, error: 'Parametro "anio" invalido', filtros: null };
    }
    anio = n;
  }
  if (!vacio(body.semana)) {
    const n = aEntero(body.semana);
    if (n === null || n < 1 || n > 53 || anio === 0) {
      return { valido: false, error: 'Parametro "semana" invalido', filtros: null };
    }
    semana = n;
  }
  return { valido: true, error: null, filtros: { anio, semana } };
}

const RE_ENCABEZADO_ALERTAS = /^[\s#*_>\-•]*alertas\b/i;
const RE_VINETA = /^\s*(?:[-*•–]|\d{1,2}[.)])\s+(.+)$/;

function limpiarVineta(texto) {
  return texto.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Viñetas del bloque "Alertas y puntos clave" que Fase B deja al final del resumen.
 * @param {string} resumen
 * @returns {string[]} hasta 3 textos limpios (sin markdown); [] si no hay bloque
 */
function extraerAlertas(resumen) {
  if (typeof resumen !== 'string' || resumen === '') return [];
  const lineas = quitarMarcadorCifras(resumen).split(/\r?\n/);
  const i = lineas.findIndex(l => RE_ENCABEZADO_ALERTAS.test(l));
  if (i === -1) return [];

  const alertas = [];
  for (let j = i + 1; j < lineas.length && alertas.length < MAX_ALERTAS; j++) {
    const linea = lineas[j];
    if (linea.trim() === '') {
      if (alertas.length > 0) break;
      continue;
    }
    const m = RE_VINETA.exec(linea);
    if (!m) {
      if (alertas.length > 0) break; // otro bloque: se acabaron las viñetas
      continue;
    }
    const texto = limpiarVineta(m[1]);
    if (texto) alertas.push(texto.length > MAX_LARGO_ALERTA ? texto.slice(0, MAX_LARGO_ALERTA - 1).trimEnd() + '…' : texto);
  }
  return alertas;
}

function cifrasDePanorama(resumen) {
  const r = extraerCifras(resumen);
  const out = {};
  if (r) for (const k of CLAVES_PANORAMA) if (typeof r.cifras[k] === 'number') out[k] = r.cifras[k];
  return out;
}

function fechaTexto(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

/**
 * @param {Array<{anio:number|string, semana:number|string, fecha_publicacion?:*, resumen?:string}>} filas
 *        Boletines procesados, del más reciente al más antiguo (tal como los entrega la consulta SQL).
 * @param {{anio:number, semana:number}} filtros - salida de validarFiltrosPanorama (0 = el más reciente)
 * @param {{total?:number|string, con_cifras?:number|string}} [conteos] - totales de toda la tabla
 * @returns {{ok:true, ...}|{ok:false, error:string}}
 */
function construirPanorama(filas, filtros, conteos) {
  const lista = (Array.isArray(filas) ? filas : [])
    .map(f => ({
      anio: Number(f.anio),
      semana: Number(f.semana),
      fecha_publicacion: fechaTexto(f.fecha_publicacion),
      resumen: typeof f.resumen === 'string' ? f.resumen : '',
    }))
    .filter(f => Number.isInteger(f.anio) && Number.isInteger(f.semana));

  const estado = {
    boletines_procesados: Number(conteos && conteos.total) || lista.length,
    con_cifras: Number(conteos && conteos.con_cifras) || 0,
  };
  const periodos = lista.map(f => ({ anio: f.anio, semana: f.semana }));

  const f = filtros || { anio: 0, semana: 0 };
  let elegido;
  if (f.anio && f.semana) {
    elegido = lista.find(b => b.anio === f.anio && b.semana === f.semana);
    if (!elegido) return { ok: false, error: 'Boletin no encontrado' };
  } else if (lista.length > 0) {
    // El más reciente que traiga cifras; si ninguno las trae, el más reciente a secas.
    elegido = lista.find(b => Object.keys(cifrasDePanorama(b.resumen)).length > 0) || lista[0];
  }

  if (!elegido) {
    return { ok: true, boletin: null, cifras: {}, tiene_cifras: false, alertas: [], periodos, estado, riesgo: null };
  }

  const cifras = cifrasDePanorama(elegido.resumen);
  let fechas = { fecha_inicio: null, fecha_fin: null };
  try {
    const r = calcularRangoFechasSemana(elegido.anio, elegido.semana);
    fechas = { fecha_inicio: r.fecha_inicio, fecha_fin: r.fecha_fin };
  } catch { /* año/semana fuera de rango: se muestra sin fechas */ }

  return {
    ok: true,
    boletin: {
      anio: elegido.anio,
      semana: elegido.semana,
      fecha_inicio: fechas.fecha_inicio,
      fecha_fin: fechas.fecha_fin,
      fecha_publicacion: elegido.fecha_publicacion,
    },
    cifras,
    tiene_cifras: Object.keys(cifras).length > 0,
    alertas: extraerAlertas(elegido.resumen),
    periodos,
    estado,
    riesgo: null, // HU-4: el nivel de riesgo del panorama aún no se calcula
  };
}

module.exports = { validarFiltrosPanorama, extraerAlertas, construirPanorama, CLAVES_PANORAMA };
