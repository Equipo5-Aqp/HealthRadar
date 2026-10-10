// @healthradar/core — validators/resumen-boletin.js
// ─────────────────────────────────────────────────────────
// Valida el output del LLM para la extracción de boletines epidemiológicos.
// Extraído del nodo "Validar resumen (detiene si falla)" del workflow Fase B.
//
// Además de la forma del texto, detecta inconsistencias numéricas usando el
// marcador [CIFRAS: ...] (ver parsers/cifras-boletin.js):
//   1. la semana del texto coincide con la del boletín que se procesa;
//   2. las partes suman el total (dengue por gravedad, EDA por tipo);
//   3. entre semanas: un acumulado no baja y no crece de forma absurda
//      respecto al del boletín procesado anteriormente (mismo año).

'use strict';

const { extraerCifras } = require('../parsers/cifras-boletin');
const { verificarCifrasContraFuente } = require('./cifras-en-fuente');
const { extraerCifrasTablas } = require('../parsers/tablas-boletin');

/** Desgloses que deben sumar exactamente su total (verificado en boletines SE 2, 9 y 10). */
const SUMAS = [
  {
    total: 'dengue_total',
    partes: ['dengue_sin_alarma', 'dengue_con_alarma', 'dengue_graves'],
    etiqueta: 'Dengue (sin alarma + con alarma + graves)',
  },
  {
    total: 'eda_total',
    partes: ['eda_acuosas', 'eda_disentericas'],
    etiqueta: 'EDA (acuosas + disentéricas)',
  },
];

/** Acumulados del año: no deberían disminuir de una semana a la siguiente. */
const ACUMULADOS = [
  'dengue_total', 'dengue_defunciones', 'ira_total', 'ira_neumonias', 'eda_total',
  'sarampion_notificados', 'pfa_total', 'ofidismo_total', 'muerte_materna_directa',
];

/** Acumulados grandes a los que además se aplica un tope de crecimiento semanal. */
const CON_TOPE = [
  'dengue_total', 'ira_total', 'eda_total',
  'sarampion_notificados', 'pfa_total', 'ofidismo_total', 'muerte_materna_directa',
];

const OPCIONES_POR_DEFECTO = {
  // Cuántas veces el promedio semanal acumulado hasta la semana previa puede crecer, como máximo.
  factorCrecimiento: 5,
  // Los boletines corrigen acumulados con retraso: se tolera una baja pequeña antes de rechazar.
  toleranciaBaja: 0.02,
  // Con menos semanas previas el promedio semanal es demasiado ruidoso para fijar un tope.
  semanaMinimaParaTope: 2,
  // Con conteos muy chicos (p. ej. 2 defunciones) un salto de 1 a 5 es ruido, no error.
  valorMinimoParaTope: 10,
};

const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/**
 * Detecta inconsistencias numéricas entre las cifras de un resumen y (opcionalmente)
 * las del resumen previo del mismo año.
 *
 * @param {Object<string, number>} actual
 * @param {Object<string, number>|null} previo
 * @param {{ semanaActual?: number, semanaPrevia?: number, factorCrecimiento?: number,
 *           toleranciaBaja?: number, semanaMinimaParaTope?: number }} [opciones]
 * @returns {string[]} descripciones legibles (vacío si todo es coherente)
 */
function detectarInconsistenciasCifras(actual, previo, opciones = {}) {
  // Los valores undefined no deben pisar los de por defecto.
  const definidas = Object.fromEntries(Object.entries(opciones).filter(([, v]) => v !== undefined));
  const o = { ...OPCIONES_POR_DEFECTO, ...definidas };
  const problemas = [];

  for (const { total, partes, etiqueta } of SUMAS) {
    if (actual[total] === undefined || !partes.every(p => actual[p] !== undefined)) continue;
    const suma = partes.reduce((acc, p) => acc + actual[p], 0);
    if (suma !== actual[total]) {
      problemas.push(
        `${etiqueta}: las partes suman ${fmt(suma)} y el total declarado es ${fmt(actual[total])}`
      );
    }
  }

  const { semanaActual, semanaPrevia } = o;
  const comparable = previo && Number.isFinite(semanaActual) && Number.isFinite(semanaPrevia)
    && semanaPrevia < semanaActual;
  if (comparable) {
    const dSemanas = semanaActual - semanaPrevia;
    for (const clave of ACUMULADOS) {
      if (actual[clave] === undefined || previo[clave] === undefined) continue;
      const a = actual[clave];
      const p = previo[clave];

      if (a < p * (1 - o.toleranciaBaja)) {
        problemas.push(
          `${clave}: bajó de ${fmt(p)} (SE ${semanaPrevia}) a ${fmt(a)} (SE ${semanaActual}); un acumulado no debería disminuir`
        );
        continue;
      }
      if (CON_TOPE.includes(clave) && semanaPrevia >= o.semanaMinimaParaTope && p >= o.valorMinimoParaTope) {
        const tope = Math.round(o.factorCrecimiento * (p / semanaPrevia) * dSemanas);
        if (a - p > tope) {
          problemas.push(
            `${clave}: creció ${fmt(a - p)} entre la SE ${semanaPrevia} y la SE ${semanaActual} (de ${fmt(p)} a ${fmt(a)}); ` +
            `el máximo razonable es ${fmt(tope)}`
          );
        }
      }
    }
  }
  return problemas;
}

/**
 * Valida que el resumen generado por el LLM sea un texto válido, corresponda a la
 * semana esperada y no contenga cifras contradictorias.
 *
 * @param {string} output - Texto generado por el LLM
 * @param {string} modeloUsado - Identificador del modelo que generó el resumen
 * @param {number} semanaEsperada - Semana epidemiológica del boletín que se procesa
 * @param {{ semanaPrevia?: number, resumenPrevio?: string, exigirCifras?: boolean,
 *           textoFuente?: string, factorCrecimiento?: number, toleranciaBaja?: number }} [opciones]
 *        textoFuente: texto del PDF; si se pasa, cada valor de [CIFRAS] debe aparecer en él (se rechaza si no)
 *        y las cifras de 1000 o más del texto que no aparezcan generan una advertencia. Además se leen las
 *        tablas del PDF (parsers/tablas-boletin) y toda clave de [CIFRAS] que difiera de la tabla se rechaza
 *        (opciones.modoTablas = 'advertir' lo degrada a advertencia). El resultado trae `cifrasTablas`.
 *        semanaPrevia / resumenPrevio: boletín ya procesado inmediatamente anterior (mismo año).
 *        exigirCifras: si es true, un resumen sin marcador [CIFRAS: ...] se rechaza
 *        (por defecto solo genera una advertencia, para poder desplegar antes que el prompt).
 * @returns {{ resumen: string, cifras: Object<string, number>|null, advertencias: string[] }}
 * @throws {Error} Si el output es inválido, la semana no coincide o hay cifras inconsistentes
 *                 (en ese último caso `error.codigo === 'RESUMEN_INCONSISTENTE'` y
 *                 `error.inconsistencias` lista los problemas).
 */
function validarResumenBoletin(output, modeloUsado, semanaEsperada, opciones = {}) {
  if (!output || typeof output !== 'string' || output.trim().length === 0) {
    throw new Error(
      'El modelo no devolvio un resumen valido (fuente: ' + modeloUsado + ')'
    );
  }

  // Validación: el resumen debe incluir la línea de semana epidemiológica
  const semanaMatch = output.match(/SEMANA EPIDEMIOL[OÓ]GICA:\s*(\d{1,2})/i);
  if (!semanaMatch) {
    throw new Error(
      'El resumen del modelo no incluye la linea SEMANA EPIDEMIOLOGICA esperada (fuente: ' +
      modeloUsado + ')'
    );
  }

  const inconsistencias = [];
  const advertencias = [];
  let cifrasTablas = null;

  const semanaTexto = Number(semanaMatch[1]);
  if (semanaEsperada !== undefined && semanaEsperada !== null && Number(semanaEsperada) !== semanaTexto) {
    inconsistencias.push(
      `la línea SEMANA EPIDEMIOLOGICA dice ${semanaTexto} pero se está procesando la SE ${Number(semanaEsperada)}`
    );
  }

  const extraido = extraerCifras(output);
  let cifras = null;
  if (extraido === null) {
    if (opciones.exigirCifras) {
      inconsistencias.push('falta la línea final [CIFRAS: ...]');
    } else {
      advertencias.push('El resumen no trae la línea [CIFRAS: ...]; no se validaron las cifras');
    }
  } else {
    cifras = extraido.cifras;
    if (extraido.invalidas.length > 0) {
      inconsistencias.push(`la línea [CIFRAS: ...] tiene pares inválidos: ${extraido.invalidas.join(' | ')}`);
    }

    let previo = null;
    if (typeof opciones.resumenPrevio === 'string' && opciones.resumenPrevio.trim() !== '') {
      const p = extraerCifras(opciones.resumenPrevio);
      if (p === null) {
        advertencias.push(
          `El resumen previo (SE ${opciones.semanaPrevia}) no trae [CIFRAS: ...]; no se comparó entre semanas`
        );
      } else {
        previo = p.cifras;
      }
    }

    inconsistencias.push(
      ...detectarInconsistenciasCifras(cifras, previo, {
        semanaActual: semanaTexto,
        semanaPrevia: opciones.semanaPrevia === undefined || opciones.semanaPrevia === null
          ? undefined
          : Number(opciones.semanaPrevia),
        factorCrecimiento: opciones.factorCrecimiento,
        toleranciaBaja: opciones.toleranciaBaja,
      })
    );

    if (opciones.textoFuente !== undefined) {
      const f = verificarCifrasContraFuente(cifras, output, opciones.textoFuente);
      if (f.omitido) {
        advertencias.push('No se pudo leer el texto del PDF; no se verificaron las cifras contra la fuente');
      } else {
        cifrasTablas = extraerCifrasTablas(opciones.textoFuente);
        const difieren = Object.entries(cifrasTablas)
          .filter(([k, v]) => cifras[k] !== undefined && cifras[k] !== v)
          .map(([k, v]) => `${k}: el resumen dice ${fmt(cifras[k])} y la tabla del boletín dice ${fmt(v)}`);
        if (difieren.length > 0) {
          if (opciones.modoTablas === 'advertir') advertencias.push(`Cifras que difieren de la tabla: ${difieren.join('; ')}`);
          else inconsistencias.push(`cifras que difieren de la tabla del boletín (${difieren.join('; ')})`);
        }
        if (f.cifrasSinFuente.length > 0) {
          inconsistencias.push(`cifras que no aparecen en el boletín (posible error de lectura de tablas): ${f.cifrasSinFuente.join(', ')}`);
        }
        if (f.textoSinFuente.length > 0) {
          advertencias.push(`Cifras del texto que no aparecen en el boletín: ${f.textoSinFuente.map(fmt).join(', ')}`);
        }
      }
    }
  }

  if (inconsistencias.length > 0) {
    const err = new Error(
      'Resumen inconsistente (fuente: ' + modeloUsado + '): ' + inconsistencias.join('; ')
    );
    err.codigo = 'RESUMEN_INCONSISTENTE';
    err.inconsistencias = inconsistencias;
    throw err;
  }

  return { resumen: output.trim(), cifras, cifrasTablas, advertencias };
}

module.exports = { validarResumenBoletin, detectarInconsistenciasCifras };
