// CONTRATO: POST /webhook/departamentos { tabla, anio? } → 25 filas { codigo_departamento, departamento, total_casos }
//   (HU-5; sin anio = acumulado de todos los años; datos por departamento solo hasta 2024).
// El GeoJSON se carga DESDE EL NAVEGADOR con fetch (AGENTS.md: no consume RAM del servidor).
// Referencia: ADR-012 → Contratos entre capas
// Constante literal que debe coincidir con basePath de next.config.mjs.
const BASE = '/historicos'

export class ErrorMapa extends Error {
  constructor(mensaje) { super(mensaje); this.name = 'ErrorMapa' }
}

export async function cargarDepartamentos(tabla, anio) {
  let res
  try {
    res = await fetch(`${BASE}/api/departamentos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabla, anio: anio || undefined }),
    })
  } catch {
    throw new ErrorMapa('No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.')
  }
  if (!res.ok) throw new ErrorMapa(`No se pudieron cargar los casos por departamento (código ${res.status}). Intenta de nuevo en unos segundos.`)
  const raw = await res.json().catch(() => null)
  if (!Array.isArray(raw)) throw new Error('[n8nMapaAdapter] Respuesta no es array')
  return raw.map((d) => {
    if (typeof d?.codigo_departamento !== 'string' || !('total_casos' in d))
      throw new Error('[n8nMapaAdapter] Contrato violado: fila sin codigo_departamento/total_casos')
    return { codigo: d.codigo_departamento, nombre: String(d.departamento ?? ''), total: Number(d.total_casos) || 0 }
  })
}

let geoPromesa = null // el contorno no cambia: se descarga una sola vez por visita

export function cargarGeoJson() {
  if (!geoPromesa) {
    geoPromesa = fetch(`${BASE}/data/peru_departamentos.geojson`)
      .then((res) => {
        if (!res.ok) throw new ErrorMapa(`No se pudo cargar el contorno del mapa (código ${res.status}).`)
        return res.json()
      })
      .then((g) => {
        if (g?.type !== 'FeatureCollection' || !Array.isArray(g.features) || g.features.length !== 25)
          throw new Error('[n8nMapaAdapter] GeoJSON inesperado: se esperaban 25 departamentos')
        return g
      })
      .catch((e) => { geoPromesa = null; throw e instanceof ErrorMapa ? e : new ErrorMapa('No se pudo cargar el contorno del mapa.') })
  }
  return geoPromesa
}
