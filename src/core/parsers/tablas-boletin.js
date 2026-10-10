// @healthradar/core — parsers/tablas-boletin.js
// ─────────────────────────────────────────────────────────
// Lee las cifras acumuladas del año directamente de las tablas anexas del Boletín Epidemiológico
// (texto del PDF que entrega el nodo "Extract from File"), sin pasar por el LLM.
// Se usa para contrastar el [CIFRAS: ...] que escribe el modelo: el LLM suele confundir columnas
// (2024 vs 2025, semana vs acumulado) y aquí las columnas se toman por posición.
//
// Tablas (cada una con 2024 a la izquierda y 2025 a la derecha):
//   Tabla 1 (resumen): filas "Dengue ...", "Muerte materna directa", "Ofidismo"
//        12 números = [2024: sem.conf, sem.prob, acum.conf, acum.prob, defunciones, IA] + [lo mismo 2025]
//        Muerte materna: 6 números = [2024: semana, acumulado, defunciones] + [2025 igual]
//   Tabla 3 (EDA)  fila "Perú": 14 números = 2 × [acuosas SE, acuosas acum, disent. SE, disent. acum, hosp., def., total]
//   Tabla 4 (IRA)  fila "Perú": 14 números = 2 × [IRAS SE, IRAS acum, neumonías SE, neumonías acum, hosp., def., total]
//   Indicadores PFA: fila "Perú": tasa, tasa, notificados, % ...
//   Sarampión: frase "se notificaron N casos sospechosos de enfermedades febriles eruptivas: M casos de sarampión"
//
// Una clave solo se devuelve si su fila existe, tiene la cantidad exacta de números y pasa su chequeo
// interno (p. ej. neumonías + IRAS no neumonías = total IRAS). Si no, se omite: nunca se adivina.

'use strict';

const ES_NUMERO = /^\d+(?:,\d+)?$/;

function numeroDe(token) {
  return Number(token.replace(',', '.'));
}

/** Tokens numéricos de una línea; null si la línea trae algo que no es número. */
function soloNumeros(linea) {
  const t = linea.trim().split(/\s+/).filter(Boolean);
  if (t.length === 0 || !t.every(x => ES_NUMERO.test(x))) return null;
  return t;
}

/**
 * A partir de la línea `i` (ya sin la etiqueta), junta números de esa línea y de las siguientes
 * líneas que contengan solo números (el PDF a veces parte una fila en dos líneas).
 */
function juntarNumeros(lineas, i, resto) {
  const out = [];
  const primera = resto.trim() === '' ? [] : soloNumeros(resto);
  if (primera === null) return null;
  out.push(...primera);
  for (let j = i + 1; j < lineas.length && j <= i + 4; j++) {
    const n = soloNumeros(lineas[j]);
    if (n === null) break;
    out.push(...n);
  }
  return out.map(numeroDe);
}

/** Primera fila cuyo inicio es `etiqueta` y que trae exactamente `cantidad` números. */
function filaPorEtiqueta(lineas, etiqueta, cantidad, desde = 0, hasta = lineas.length) {
  for (let i = desde; i < hasta; i++) {
    const l = lineas[i].trim();
    if (!l.startsWith(etiqueta)) continue;
    const resto = l.slice(etiqueta.length);
    if (resto !== '' && !/^\s/.test(resto)) continue;           // "Muerte materna directa" no debe tomar "...directaX"
    const nums = juntarNumeros(lineas, i, resto);
    if (nums && nums.length === cantidad) return nums;
  }
  return null;
}

/** Fila "Perú" con `cantidad` números dentro de la tabla cuyo título cumple `titulo`. */
function filaPeruDeTabla(lineas, titulo, cantidad) {
  for (let i = 0; i < lineas.length; i++) {
    if (!titulo.test(lineas[i])) continue;
    const fin = Math.min(lineas.length, i + 700);
    for (let j = i + 1; j < fin; j++) {
      if (/^Tabla\s+\d/.test(lineas[j].trim())) break;
      const l = lineas[j].trim();
      if (!l.startsWith('Perú')) continue;
      const resto = l.slice(4);
      if (resto !== '' && !/^\s/.test(resto)) continue;
      const nums = juntarNumeros(lineas, j, resto);
      if (nums && nums.length === cantidad) return nums;
    }
  }
  return null;
}

/** Fila "Perú" de los indicadores de PFA: 0,63 1,25 49 97,66 73,91 81,40 5 0 (tercer valor = casos notificados). */
function pfaNotificados(lineas) {
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i].trim();
    if (!l.startsWith('Perú')) continue;
    const resto = l.slice(4);
    if (resto !== '' && !/^\s/.test(resto)) continue;
    // tokens originales, para distinguir decimales (con coma) de enteros
    const tokens = [...(soloNumeros(resto) || [])];
    for (let j = i + 1; j < lineas.length && j <= i + 4; j++) {
      const n = soloNumeros(lineas[j]);
      if (n === null) break;
      tokens.push(...n);
    }
    if (tokens.length !== 8) continue;
    const dec = x => x.includes(',');
    if (dec(tokens[0]) && dec(tokens[1]) && !dec(tokens[2]) && dec(tokens[3]) && dec(tokens[4]) && dec(tokens[5])) {
      return numeroDe(tokens[2]);
    }
  }
  return null;
}

/**
 * @param {string} texto - texto del PDF
 * @returns {Object<string, number>} solo las claves que se pudieron leer y validar
 */
function extraerCifrasTablas(texto) {
  const cifras = {};
  if (typeof texto !== 'string' || texto.length === 0) return cifras;
  const lineas = texto.split(/\r?\n/);

  // Dengue (Tabla 1): casos acumulados 2025 = confirmados + probables; defunciones en la tercera columna acumulada.
  const filas = ['Dengue sin signos de alarma', 'Dengue con signos de alarma', 'Dengue grave'].map(e => filaPorEtiqueta(lineas, e, 12));
  if (filas.every(Boolean)) {
    const [sin, con, grave] = filas.map(f => f[8] + f[9]);
    cifras.dengue_sin_alarma = sin;
    cifras.dengue_con_alarma = con;
    cifras.dengue_graves = grave;
    cifras.dengue_total = sin + con + grave;
    cifras.dengue_defunciones = filas.reduce((a, f) => a + f[10], 0);
  }

  const mm = filaPorEtiqueta(lineas, 'Muerte materna directa', 6);
  if (mm) cifras.muerte_materna_directa = mm[4];

  const ofi = filaPorEtiqueta(lineas, 'Ofidismo', 12);
  if (ofi) cifras.ofidismo_total = ofi[8];

  const eda = filaPeruDeTabla(lineas, /^Tabla\s+3\.\s*Episodios de las enfermedades diarr/i, 14);
  if (eda && eda[8] + eda[10] === eda[13]) {
    cifras.eda_acuosas = eda[8];
    cifras.eda_disentericas = eda[10];
    cifras.eda_total = eda[13];
  }

  const ira = filaPeruDeTabla(lineas, /^Tabla\s+4\.\s*Episodios de las infecciones respiratorias/i, 14);
  if (ira && ira[8] + ira[10] === ira[13]) {
    cifras.ira_neumonias = ira[10];
    cifras.ira_total = ira[13];
  }

  const pfa = pfaNotificados(lineas);
  if (pfa !== null) cifras.pfa_total = pfa;

  // Dos redacciones vistas: "329 casos sospechosos de enfermedades febriles eruptivas: 206 casos de sarampión"
  // y "329 casos de enfermedades febriles eruptivas: 206 casos sospechosos de sarampión".
  const sar = texto.match(/enfermedades\s+febriles\s+eruptivas:\s*(\d[\d ]*?)\s+casos\s+(?:sospechosos\s+)?de\s+sarampi[oó]n/i);
  if (sar) cifras.sarampion_notificados = Number(sar[1].replace(/\s/g, ''));

  return cifras;
}

/**
 * Bloque de texto para el prompt del LLM con las cifras ya leídas por código (vacío si no hay ninguna).
 * Así el modelo redacta con valores correctos en vez de leer columnas de tablas.
 * @param {Object<string, number>} cifras
 * @returns {string}
 */
function bloqueCifrasVerificadas(cifras) {
  const pares = Object.entries(cifras || {}).map(([k, v]) => `${k}=${v}`);
  if (pares.length === 0) return '';
  return 'CIFRAS VERIFICADAS DEL BOLETIN (leidas por codigo de las tablas, correctas; usalas tal cual en el resumen y en [CIFRAS]): ' +
    pares.join('; ');
}

module.exports = { extraerCifrasTablas, bloqueCifrasVerificadas };
