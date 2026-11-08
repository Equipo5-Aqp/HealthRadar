// @healthradar/core — parsers/periodo.js
// ─────────────────────────────────────────────────────────
// Detecta a qué periodo (año + rango de semanas epidemiológicas) se refiere
// la pregunta del analista, SIN usar ningún modelo de IA (cero tokens).
//
// Extraído del nodo "Detectar periodo en la pregunta" + "Resolver ventana
// por defecto (si aplica)" del workflow NLQ (Conexion posgrest.json).
//
// Períodos relativos a HOY (fecha de Lima; se puede inyectar `ahora` en las pruebas):
//   · año: «este año», «el año pasado», «hace dos años», «en lo que va del año»
//   · mes: «este mes», «el mes pasado»
//   · semana/día: «esta semana», «la semana pasada», «hoy», «ayer», «anteayer»
//   · ventanas móviles: «las últimas 4 semanas», «los últimos 6 meses», «el último año», «el último trimestre»
// Lo difuso («reciente», «actualmente», «últimas semanas» sin número) NO se interpreta: queda la ventana
// por defecto (12 semanas hasta el último boletín). Un año, semana o mes escrito con número siempre manda.

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

const NOMBRES_MES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

const DIA_MS = 86400000;
const ZONA_HORARIA = 'America/Lima';

/** Fecha de hoy en Lima ({ anio, mes, dia, iso }). `ahora` solo se inyecta en las pruebas. */
function hoyEnLima(ahora) {
  const d = ahora instanceof Date && !Number.isNaN(ahora.getTime()) ? ahora : new Date();
  let iso;
  try {
    iso = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch (e) {
    iso = d.toISOString().slice(0, 10);
  }
  const [anio, mes, dia] = iso.split('-').map(Number);
  return { anio, mes, dia, iso };
}

const fechaUTC = ({ anio, mes, dia }) => new Date(Date.UTC(anio, mes - 1, dia));
const sumarDias = (fecha, n) => new Date(fecha.getTime() + n * DIA_MS);

/** Suma meses sin salirse del mes destino (31 de mayo - 1 mes = 30 de abril). */
function sumarMeses(fecha, n) {
  const anio = fecha.getUTCFullYear();
  const mes = fecha.getUTCMonth() + n;
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(anio, mes, Math.min(fecha.getUTCDate(), ultimoDia)));
}

const semanaDe = (fecha) => getSemanaEpi(fecha.toISOString());

const NUMEROS = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 };
const NUM = '(\\d{1,3}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)';
const aNumero = (t) => (/^\d+$/.test(t) ? Number(t) : NUMEROS[t]);
const PREP = '(?:(?:en|durante|del|de)\\s+)?';

const TIENE_ANIO = /\b20[1-2]\d\b/;
const TIENE_SEMANA = /\b(?:semana|se)\s*\d{1,2}\b/;

/**
 * Cambia las expresiones relativas de un solo período por su forma explícita, que el resto del detector ya
 * entiende («el año pasado» → «2025», «este mes» → «noviembre 2026», «ayer» → «se 44 2026»).
 * Recibe el texto en minúsculas y sin tildes. Si el texto ya trae un año o una semana con número, el día,
 * la semana y el mes relativos no se tocan (quien escribe «2024» manda sobre «hoy»); el año relativo sí
 * se aplica, porque compone con lo explícito («SE 10 de este año», «marzo del año pasado»).
 */
function reescribirRelativos(texto, hoy) {
  const traeExplicito = TIENE_ANIO.test(texto) || TIENE_SEMANA.test(texto);
  let t = texto;
  let usado = false;
  const cambiar = (regex, resolver) => {
    t = t.replace(regex, (...args) => { usado = true; return ` ${resolver(...args)} `; });
  };

  // Año
  cambiar(new RegExp(`\\b${PREP}(?:el\\s+)?ano\\s+(?:pasado|anterior)\\b`, 'g'), () => hoy.anio - 1);
  cambiar(new RegExp(`\\b${PREP}(?:lo que va (?:del|de este)\\s+ano|este\\s+ano|(?:el\\s+)?ano\\s+(?:actual|en\\s+curso))\\b`, 'g'), () => hoy.anio);
  cambiar(new RegExp(`\\bhace\\s+${NUM}\\s+anos?\\b`, 'g'), (m, n) => hoy.anio - aNumero(n));

  if (!traeExplicito) {
    const fechaHoy = fechaUTC(hoy);
    const se = (fecha) => { const s = semanaDe(fecha); return `se ${s.semana} ${s.anio}`; };
    // Mes
    cambiar(new RegExp(`\\b${PREP}(?:este\\s+mes|(?:el\\s+)?mes\\s+(?:actual|en\\s+curso))\\b`, 'g'),
      () => `${NOMBRES_MES[hoy.mes]} ${hoy.anio}`);
    cambiar(new RegExp(`\\b${PREP}(?:el\\s+)?mes\\s+(?:pasado|anterior)\\b`, 'g'), () => {
      const anterior = sumarMeses(new Date(Date.UTC(hoy.anio, hoy.mes - 1, 1)), -1);
      return `${NOMBRES_MES[anterior.getUTCMonth() + 1]} ${anterior.getUTCFullYear()}`;
    });
    // Semana y día (la semana epidemiológica que contiene ese día)
    cambiar(new RegExp(`\\b${PREP}(?:la\\s+)?(?:semana\\s+(?:pasada|anterior)|ultima\\s+semana(?!\\s+(?:de|del)\\b))`, 'g'),
      () => se(sumarDias(fechaHoy, -7)));
    cambiar(new RegExp(`\\b${PREP}(?:esta\\s+semana|(?:la\\s+)?semana\\s+(?:actual|en\\s+curso))\\b`, 'g'), () => se(fechaHoy));
    cambiar(/\b(?:hoy|ahorita|ahora\s+mismo|en\s+este\s+momento)\b/g, () => se(fechaHoy));
    cambiar(/\bayer\b/g, () => se(sumarDias(fechaHoy, -1)));
    cambiar(/\b(?:anteayer|antier)\b/g, () => se(sumarDias(fechaHoy, -2)));
  }
  return { texto: t, usado };
}

const RE_ULTIMAS_SEMANAS = new RegExp(`\\bultim[oa]s\\s+${NUM}\\s+semanas\\b`);
const RE_ULTIMOS_MESES = new RegExp(`\\bultim[oa]s\\s+${NUM}\\s+meses\\b`);
const RE_ULTIMOS_ANOS = new RegExp(`\\bultim[oa]s\\s+${NUM}\\s+anos\\b`);
const RE_ULTIMO_UNO = /\bultimo\s+(mes|ano|trimestre|semestre)\b/;
const MESES_POR_UNIDAD = { mes: 1, trimestre: 3, semestre: 6, ano: 12 };

/**
 * Ventanas móviles que terminan hoy: «las últimas 4 semanas», «los últimos 6 meses», «el último año».
 * Sin número («últimas semanas») no se interpreta. Devuelve un solo año si la ventana cabe en uno; si cruza
 * de año usa el formato de la ventana por defecto (anio null + anio_desde/anio_hasta) con
 * `ventana_relativa: true`, para que resolverVentana no la reemplace y filtrarBoletines no use "todos".
 */
function detectarVentanaRelativa(texto, hoy) {
  const fechaHoy = fechaUTC(hoy);
  let desde = null;
  let etiqueta = '';

  let m = texto.match(RE_ULTIMAS_SEMANAS);
  if (m) {
    const n = aNumero(m[1]);
    if (n >= 1 && n <= 260) { desde = sumarDias(fechaHoy, -7 * (n - 1)); etiqueta = `ultimas ${n} semanas`; }
  }
  if (!desde && (m = texto.match(RE_ULTIMOS_MESES))) {
    const n = aNumero(m[1]);
    if (n >= 1 && n <= 120) { desde = sumarMeses(fechaHoy, -n); etiqueta = `ultimos ${n} meses`; }
  }
  if (!desde && (m = texto.match(RE_ULTIMOS_ANOS))) {
    const n = aNumero(m[1]);
    if (n >= 1 && n <= 10) { desde = sumarMeses(fechaHoy, -12 * n); etiqueta = `ultimos ${n} anos`; }
  }
  if (!desde && (m = texto.match(RE_ULTIMO_UNO))) {
    desde = sumarMeses(fechaHoy, -MESES_POR_UNIDAD[m[1]]);
    etiqueta = `ultimo ${m[1]}`;
  }
  if (!desde) return null;

  const ini = semanaDe(desde);
  const fin = semanaDe(fechaHoy);
  if (ini.anio === fin.anio) {
    return {
      anio: ini.anio,
      semana_desde: ini.semana,
      semana_hasta: fin.semana,
      criterio_usado: `${etiqueta} (hoy ${hoy.iso}): SE ${ini.semana} a SE ${fin.semana} de ${ini.anio}`,
      relativo_a: hoy.iso,
    };
  }
  return {
    anio: null,
    semana_desde: ini.semana,
    semana_hasta: fin.semana,
    anio_desde: ini.anio,
    anio_hasta: fin.anio,
    ventana_relativa: true,
    criterio_usado: `${etiqueta} (hoy ${hoy.iso}): SE ${ini.semana}-${ini.anio} a SE ${fin.semana}-${fin.anio}`,
    relativo_a: hoy.iso,
  };
}

/**
 * Reglas con año, semana o mes escritos en la pregunta (rango de meses, "SE N", "<mes> <año>", varios años,
 * "en AAAA"). Devuelve null si no hay ninguna. `texto` ya viene en minúsculas.
 */
function detectarExplicito(texto, anioActual) {
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
  // El año puede ir pegado ("SE 5 2025", "SE5-2025", "5/2025") o con conector
  // ("semana 5 del 2025", "de 2025", "en el 2025", "del año 2025"). \b evita falsos positivos
  // dentro de otras palabras ("pase 12", "base 3").
  const regexSemana = /\b(?:semana|se)\s*(\d{1,2})(?:\s*(?:[-\/,]|del?|en(?:\s+el)?)?\s*(?:a[nñ]o\s+)?(\d{4}))?/i;
  const matchSemana = texto.match(regexSemana);
  if (matchSemana) {
    const semana = Number(matchSemana[1]);
    // Año: el que acompaña a la semana; si no hay, un año suelto en cualquier parte de la pregunta
    // ("casos del 2025 en la semana 5"); si tampoco, el año actual.
    const anioSuelto = texto.match(/\b(20[1-2]\d)\b/);
    const anio = matchSemana[2] ? Number(matchSemana[2])
      : anioSuelto ? Number(anioSuelto[1])
      : anioActual;
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

  // 3.2. Varios años ("2023 y 2024", "de 2022 a 2024", "2023-2024", "compara 2023 con 2024"):
  // se toma del año más antiguo al más reciente, completos. Va después de semana y mes (que traen su
  // propio año) y antes del año suelto, que solo miraba el primero.
  const aniosMencionados = [...new Set((texto.match(/\b20[1-2]\d\b/g) || []).map(Number))];
  if (aniosMencionados.length >= 2) {
    const anioDesde = Math.min(...aniosMencionados);
    const anioHasta = Math.max(...aniosMencionados);
    return {
      anio: null,
      semana_desde: 1,
      semana_hasta: 53,
      anio_desde: anioDesde,
      anio_hasta: anioHasta,
      rango_anios: true,
      criterio_usado: `varios anios: ${anioDesde} a ${anioHasta}`,
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

  return null;
}


/**
 * Detecta a qué periodo se refiere la pregunta del analista.
 *
 * Varios años ("2023 y 2024", "de 2022 a 2024", "compara 2023 con 2024"): devuelve el rango de años
 * COMPLETOS con anio = null, anio_desde, anio_hasta y rango_anios = true (mismo formato que usa la
 * ventana por defecto, así los demás pasos ya lo entienden).
 *
 * @param {string} pregunta - Texto en lenguaje natural del analista (si no es texto, se trata como vacío)
 * @param {Date} [ahora] - Momento de referencia para lo relativo ("este año", "ayer"…); por defecto, ahora. Solo se inyecta en pruebas.
 * @returns {{ anio: number|null, semana_desde: number|null, semana_hasta: number|null,
 *             ventana_por_defecto?: number, anio_desde?: number, anio_hasta?: number,
 *             rango_anios?: boolean, ventana_relativa?: boolean, relativo_a?: string, criterio_usado: string }}
 */
function detectarPeriodo(pregunta, ahora) {
  const original = (typeof pregunta === 'string' ? pregunta : '').toLowerCase();
  const hoy = hoyEnLima(ahora);

  // Expresiones relativas ("el año pasado", "este mes", "ayer"): se pasan a su forma explícita y se usan
  // las mismas reglas de siempre. Solo si hubo alguna se trabaja sobre el texto sin tildes.
  const sinTildes = original.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const rel = reescribirRelativos(sinTildes, hoy);
  const explicito = detectarExplicito(rel.usado ? rel.texto : original, hoy.anio);
  if (explicito) {
    return rel.usado
      ? { ...explicito, criterio_usado: `${explicito.criterio_usado} (relativo a hoy ${hoy.iso})`, relativo_a: hoy.iso }
      : explicito;
  }

  // Ventanas móviles que terminan hoy ("las últimas 4 semanas", "el último año")
  const ventana = detectarVentanaRelativa(sinTildes, hoy);
  if (ventana) return ventana;

  // Nada detectado: ventana por defecto (últimas 12 semanas hasta el último boletín)
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

  // Ventana móvil relativa a hoy ("el último año"): ya trae su rango; no se reemplaza por la ventana por defecto.
  if (deteccion.ventana_relativa === true && !esNulo(deteccion.anio_desde) && !esNulo(deteccion.anio_hasta)
    && !esNulo(deteccion.semana_desde) && !esNulo(deteccion.semana_hasta)) {
    return deteccion;
  }

  // Rango de años pedido por el analista ("2023 y 2024"): también es explícito. Sin esto se
  // reemplazaría por la ventana de las últimas 12 semanas.
  if (deteccion.rango_anios === true && !esNulo(deteccion.anio_desde) && !esNulo(deteccion.anio_hasta)) {
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
  _internal: { getSemanaEpi, rangoSemanasDeMes, tieneResumenReal, MESES, hoyEnLima, sumarMeses },
};
