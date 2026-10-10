// Clasificación por quintiles de departamentos: cada color agrupa ~5 de los 25 departamentos.
// Con valores tan desiguales (Lima concentra muchos casos) una escala lineal dejaría 20 departamentos
// del mismo color; los quintiles mantienen legible el orden relativo.
export const NIVELES = 5

/** valores: number[] → { umbrales:number[4], nivel(v):0..4 }. Nivel 0 incluye los ceros. */
export function crearEscala(valores) {
  const orden = [...valores].sort((a, b) => a - b)
  const n = orden.length
  const umbrales = n === 0 ? [] : Array.from({ length: NIVELES - 1 }, (_, i) => orden[Math.floor((n * (i + 1)) / NIVELES)])
  return {
    umbrales,
    nivel: (v) => umbrales.filter((u) => v > u).length,
  }
}

/** Rango de valores de cada nivel, para la leyenda accesible: [{min,max}|null ×5]. */
export function rangosPorNivel(valores, escala) {
  const rangos = Array.from({ length: NIVELES }, () => null)
  for (const v of valores) {
    const l = escala.nivel(v)
    rangos[l] = rangos[l] ? { min: Math.min(rangos[l].min, v), max: Math.max(rangos[l].max, v) } : { min: v, max: v }
  }
  return rangos
}
