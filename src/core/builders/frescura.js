// @healthradar/core — builders/frescura.js
// ─────────────────────────────────────────────────────────
// Sprint 4 · HU4 (frescura de datos): hasta cuándo llegan los datos del sistema y si están al día.
// Webhook /panorama lo agrega a su respuesta como `frescura` (el front muestra «datos hasta SE n»).
//
// Fuentes:
//   · boletines — último boletín PROCESADO (con su fecha de publicación) y cuántos hay pendientes;
//   · clima     — última semana con dato climático (la fecha sale de la semana epidemiológica);
//   · casos     — cargas históricas de MINSA (control_carga): se informa «hasta el año X», sin calificar.
//
// Regla: boletines y clima están «al día» si su fecha más reciente tiene como máximo 21 días; si no,
// «desactualizado». Si no hay dato, «sin_datos». El estado general es el peor de los dos.
//
// Puro: sin n8n, sin PostgreSQL, sin red. La fecha de hoy entra como parámetro (el nodo pasa new Date()).

'use strict';

const { calcularRangoFechasSemana } = require('./rango-semana');

const UMBRAL_BOLETINES_DIAS = 21;
const UMBRAL_CLIMA_DIAS = 21;
const MS_DIA = 86400000;

const aEntero = v => {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};

// Date o texto «AAAA-MM-DD…» → milisegundos UTC a las 00:00 de ese día; si no es una fecha, null.
function aDiaUtc(v) {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
  }
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (!m) return null;
    const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const diasEntre = (hoyMs, fechaMs) => Math.max(0, Math.floor((hoyMs - fechaMs) / MS_DIA));

// Fecha de fin de una semana epidemiológica (o null si año/semana no son válidos).
function finDeSemana(anio, semana) {
  try {
    return calcularRangoFechasSemana(anio, semana).fecha_fin || null;
  } catch {
    return null;
  }
}

function estadoPorDias(dias, umbral) {
  if (dias === null) return 'sin_datos';
  return dias > umbral ? 'desactualizado' : 'al_dia';
}

function bloqueBoletines(d, hoyMs) {
  const p = d.boletin_procesado || {};
  const anio = aEntero(p.anio);
  const semana = aEntero(p.semana !== undefined ? p.semana : p.semana_epidemiologica);
  const desc = d.ultimo_descubierto || null;
  const pendientes = Math.max(0, aEntero(d.pendientes) || 0);
  const descubierto = desc && Number.isInteger(aEntero(desc.anio)) && Number.isInteger(aEntero(desc.semana))
    ? { anio: aEntero(desc.anio), semana: aEntero(desc.semana) } : null;

  if (Number.isNaN(anio) || Number.isNaN(semana)) {
    return { estado: 'sin_datos', anio: null, semana: null, fecha_publicacion: null, dias: null, pendientes, ultimo_descubierto: descubierto, umbral_dias: UMBRAL_BOLETINES_DIAS };
  }
  // Fecha de publicación del portal; si falta, se usa el fin de la semana (la publicación es posterior).
  let fecha = aDiaUtc(p.fecha_publicacion);
  let aproximada = false;
  if (fecha === null) {
    fecha = aDiaUtc(finDeSemana(anio, semana));
    aproximada = fecha !== null;
  }
  const dias = fecha === null || hoyMs === null ? null : diasEntre(hoyMs, fecha);
  return {
    estado: estadoPorDias(dias, UMBRAL_BOLETINES_DIAS),
    anio,
    semana,
    fecha_publicacion: fecha === null ? null : iso(fecha),
    fecha_aproximada: aproximada,
    dias,
    pendientes,
    ultimo_descubierto: descubierto,
    umbral_dias: UMBRAL_BOLETINES_DIAS,
  };
}

function bloqueClima(d, hoyMs) {
  const c = d.clima || {};
  const anio = aEntero(c.anio);
  const semana = aEntero(c.semana);
  if (Number.isNaN(anio) || Number.isNaN(semana)) {
    return { estado: 'sin_datos', anio: null, semana: null, fecha_fin: null, dias: null, umbral_dias: UMBRAL_CLIMA_DIAS };
  }
  const fin = aDiaUtc(finDeSemana(anio, semana));
  const dias = fin === null || hoyMs === null ? null : diasEntre(hoyMs, fin);
  return {
    estado: estadoPorDias(dias, UMBRAL_CLIMA_DIAS),
    anio,
    semana,
    fecha_fin: fin === null ? null : iso(fin),
    dias,
    umbral_dias: UMBRAL_CLIMA_DIAS,
  };
}

function bloqueCasos(d) {
  const datasets = [];
  for (const c of Array.isArray(d.cargas) ? d.cargas : []) {
    const anio = aEntero(c && c.hasta_anio);
    if (!c || typeof c.dataset !== 'string' || Number.isNaN(anio)) continue;
    const carga = aDiaUtc(typeof c.ultima_carga === 'string' ? c.ultima_carga : null);
    datasets.push({ dataset: c.dataset, hasta_anio: anio, ultima_carga: carga === null ? null : iso(carga) });
  }
  if (datasets.length === 0) return { estado: 'sin_datos', hasta_anio: null, ultima_carga: null, datasets: [] };
  const cargas = datasets.map(x => x.ultima_carga).filter(Boolean).sort();
  return {
    estado: 'historico', // datos abiertos del MINSA hasta un año cerrado: se informa, no se califica
    hasta_anio: Math.max(...datasets.map(x => x.hasta_anio)),
    ultima_carga: cargas.length ? cargas[cargas.length - 1] : null,
    datasets,
  };
}

function plural(n, uno, varios) { return `${n} ${n === 1 ? uno : varios}`; }

function armarMensaje(estado, b, c, k) {
  const partes = [];
  partes.push(b.anio === null
    ? 'Boletines: sin datos'
    : `Boletines hasta la SE ${b.semana}-${b.anio}${b.dias === null ? '' : ` (publicado hace ${plural(b.dias, 'día', 'días')})`}`);
  partes.push(c.anio === null ? 'Clima: sin datos' : `Clima hasta la SE ${c.semana}-${c.anio}`);
  if (k.hasta_anio !== null) partes.push(`Casos históricos hasta ${k.hasta_anio}`);
  return `${estado === 'desactualizado' ? 'Datos desactualizados. ' : ''}${partes.join(' · ')}`;
}

/**
 * @param {{
 *   boletin_procesado?: {anio:number|string, semana?:number|string, semana_epidemiologica?:number|string, fecha_publicacion?:string|Date|null},
 *   ultimo_descubierto?: {anio:number|string, semana:number|string, fecha_publicacion?:string|null}|null,
 *   pendientes?: number|string,
 *   clima?: {anio:number|string, semana:number|string}|null,
 *   cargas?: Array<{dataset:string, hasta_anio:number|string, ultima_carga?:string|null}>
 * }} datos
 * @param {Date|string} hoy - fecha de hoy (el nodo pasa new Date())
 * @returns {{ generado_en:string|null, estado:'al_dia'|'desactualizado'|'sin_datos', mensaje:string,
 *            boletines:object, clima:object, casos:object }}
 */
function construirFrescura(datos, hoy) {
  const d = datos && typeof datos === 'object' ? datos : {};
  const hoyMs = aDiaUtc(hoy);
  const boletines = bloqueBoletines(d, hoyMs);
  const clima = bloqueClima(d, hoyMs);
  const casos = bloqueCasos(d);

  let estado;
  if (boletines.estado === 'desactualizado' || clima.estado === 'desactualizado') estado = 'desactualizado';
  else if (boletines.estado === 'sin_datos' && clima.estado === 'sin_datos') estado = 'sin_datos';
  else estado = 'al_dia';

  return {
    generado_en: hoyMs === null ? null : iso(hoyMs),
    estado,
    mensaje: armarMensaje(estado, boletines, clima, casos),
    boletines,
    clima,
    casos,
  };
}

module.exports = { construirFrescura, UMBRAL_BOLETINES_DIAS, UMBRAL_CLIMA_DIAS };
