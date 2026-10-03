// @healthradar/core — filters/boletines-nuevos.js
// ─────────────────────────────────────────────────────────
// Fase A: descarta del listado los boletines cuyo (año, semana) ya existe en
// boletin_descubierto, y deja los nuevos listos para insertar como pendientes.

'use strict';

const clave = (anio, semana) => `${anio}-${semana}`;

/**
 * @param {{anio:number, semana_epidemiologica:number}[]} candidatos - Recién extraídos del DGE
 * @param {{anio:number, semana_epidemiologica:number}[]} existentes - Filas de boletin_descubierto
 * @returns {object[]} Solo los nuevos, sin repetir (año, semana), con resumen '' y procesado false
 */
function filtrarNuevos(candidatos, existentes) {
  const vistos = new Set((existentes || []).map((e) => clave(e.anio, e.semana_epidemiologica)));
  const nuevos = [];

  for (const c of candidatos || []) {
    const k = clave(c.anio, c.semana_epidemiologica);
    if (vistos.has(k)) continue;
    vistos.add(k);
    nuevos.push({ ...c, resumen: '', procesado: false });
  }
  return nuevos;
}

module.exports = { filtrarNuevos };
