// @healthradar/core — parsers/boletines-dge.js
// ─────────────────────────────────────────────────────────
// Fase A: extrae los boletines del HTML de listado_ajax del DGE.
//
// La semana NO se toma del nombre del PDF (el DGE es inconsistente: '202610',
// '20269', o sin semana). Se usa el <span class='periodoVal'>N</span> que el DGE
// pone siempre dentro del mismo <tr>. La fecha sale de 'fecha publicacion: DD-MM-AAAA'.
// El HTML repite cada link (miniatura + título): se deduplica por URL.

'use strict';

const FILA = /<tr>([\s\S]*?)<\/tr>/g;
const URL_PDF = /href='(https:\/\/epipublic\.dge\.gob\.pe\/uploads\/boletin\/boletin_[^']+\.pdf)'/;
const SEMANA = /periodoVal'>(\d{1,2})<\/span>/;
const FECHA = /fecha publicacion:\s*(\d{2})-(\d{2})-(\d{4})/;

/** 'DD','MM','AAAA' → 'AAAA-MM-DD', o null si no es una fecha real. */
function fechaISO(dd, mm, aaaa) {
  const d = new Date(Date.UTC(Number(aaaa), Number(mm) - 1, Number(dd)));
  const real = d.getUTCFullYear() === Number(aaaa)
    && d.getUTCMonth() === Number(mm) - 1
    && d.getUTCDate() === Number(dd);
  return real ? `${aaaa}-${mm}-${dd}` : null;
}

/**
 * @param {string} html  - Respuesta del listado_ajax
 * @param {number} anio  - Año que se consultó al DGE
 * @returns {{url_boletin:string, anio:number, semana_epidemiologica:number, fecha_publicacion:string|null}[]}
 */
function extraerLinksBoletines(html, anio) {
  if (typeof html !== 'string') return [];

  const vistos = new Set();
  const boletines = [];

  for (const fila of html.matchAll(FILA)) {
    const bloque = fila[1];
    const url = bloque.match(URL_PDF);
    const semana = bloque.match(SEMANA);
    if (!url || !semana) continue; // fila sin link o sin semana

    const numero = Number(semana[1]);
    if (numero < 1 || numero > 53) continue; // semana imposible

    if (vistos.has(url[1])) continue; // link repetido
    vistos.add(url[1]);

    const fecha = bloque.match(FECHA);
    boletines.push({
      url_boletin: url[1],
      anio,
      semana_epidemiologica: numero,
      fecha_publicacion: fecha ? fechaISO(fecha[1], fecha[2], fecha[3]) : null,
    });
  }
  return boletines;
}

module.exports = { extraerLinksBoletines };
