// @healthradar/core — validators/cifras-en-fuente.js
// ─────────────────────────────────────────────────────────
// Comprueba que las cifras que el LLM puso en [CIFRAS: ...] (y las cifras grandes del texto)
// existan literalmente en el texto del PDF. Atrapa números inventados o mal armados al leer
// tablas (p. ej. 56 337 neumonías, que no aparece en el boletín; el real era 14 337).
//
// Limite conocido: NO detecta un numero real tomado de otra columna (p. ej. el acumulado de 2024
// o los casos de la semana en vez de las defunciones): ese numero si esta en el PDF.

'use strict';

/** Por debajo de este largo el texto de la fuente no es fiable (PDF escaneado, error de lectura). */
const LARGO_MINIMO_FUENTE = 500;

/** Cifras del texto menores a esto no se verifican (semanas, porcentajes, conteos chicos). */
const MINIMO_CIFRA_TEXTO = 1000;

/**
 * Conjunto de enteros que aparecen en el texto, con o sin separador de miles
 * (espacio, NBSP, punto o coma): "35 792", "35.792", "35,792" y "35792" dan 35792.
 * Cada tramo de dígitos también se agrega suelto, porque en las tablas las columnas
 * quedan separadas por espacios y un par de columnas puede parecer "miles".
 * @param {string} texto
 * @returns {Set<number>}
 */
function numerosDelTexto(texto) {
  const s = new Set();
  const t = String(texto || '');
  for (const m of t.matchAll(/\d+/g)) s.add(Number(m[0]));
  for (const m of t.matchAll(/\d{1,3}(?:[  .,]\d{3})+(?!\d)/g)) {
    s.add(Number(m[0].replace(/[  .,]/g, '')));
  }
  return s;
}

/**
 * @param {Object<string, number>} cifras - claves/valores de [CIFRAS: ...]
 * @param {string} resumen - texto del resumen (sin necesidad de quitar la línea CIFRAS)
 * @param {string} textoFuente - texto extraído del PDF
 * @returns {{ omitido: boolean, cifrasSinFuente: string[], textoSinFuente: number[] }}
 */
function verificarCifrasContraFuente(cifras, resumen, textoFuente) {
  if (typeof textoFuente !== 'string' || textoFuente.trim().length < LARGO_MINIMO_FUENTE) {
    return { omitido: true, cifrasSinFuente: [], textoSinFuente: [] };
  }
  const enFuente = numerosDelTexto(textoFuente);
  const cifrasSinFuente = Object.entries(cifras || {})
    .filter(([, v]) => !enFuente.has(v))
    .map(([k, v]) => `${k}=${v}`);

  const cuerpo = String(resumen || '').replace(/\[CIFRAS:[^\]]*\]/i, '');
  const textoSinFuente = [];
  for (const n of numerosDelTexto(cuerpo)) {
    if (n >= MINIMO_CIFRA_TEXTO && !enFuente.has(n) && !textoSinFuente.includes(n)) textoSinFuente.push(n);
  }
  return { omitido: false, cifrasSinFuente, textoSinFuente };
}

module.exports = { verificarCifrasContraFuente, numerosDelTexto, LARGO_MINIMO_FUENTE, MINIMO_CIFRA_TEXTO };
