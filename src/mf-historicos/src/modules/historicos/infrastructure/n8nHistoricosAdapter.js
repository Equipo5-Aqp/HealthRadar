// CONTRATO: POST /webhook/historicos { tabla, pagina, departamento?, anio? } → array de filas (100 por página).
//   400 { error } si el core rechaza algún filtro.
// Referencia: ADR-012 → Contratos entre capas
// NEXT_PUBLIC_BASEPATH NO se usa como env var: las NEXT_PUBLIC_* se inlinan en 'next build', no se leen
// en runtime. Constante literal que debe coincidir con basePath de next.config.mjs.
const BASE = '/historicos'

export class ErrorHistoricos extends Error {
  constructor(tipo, mensaje) {
    super(mensaje)
    this.name = 'ErrorHistoricos'
    this.tipo = tipo // 'filtro' (400) | 'conexion' | 'servidor'
  }
}

export async function cargarHistoricos(tabla, pagina, departamento, anio) {
  let res
  try {
    res = await fetch(`${BASE}/api/historicos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabla, pagina, departamento: departamento || undefined, anio: anio || undefined }),
    })
  } catch {
    throw new ErrorHistoricos('conexion', 'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.')
  }
  if (res.status === 400) throw new ErrorHistoricos('filtro', 'Revisa los filtros: el departamento o el año no son válidos.')
  if (!res.ok) throw new ErrorHistoricos('servidor', `No se pudo conectar con el servicio (código ${res.status}). Intenta de nuevo en unos segundos.`)
  const raw = await res.json().catch(() => null)
  if (!Array.isArray(raw)) throw new Error('[n8nHistoricosAdapter] Respuesta no es array')
  return raw
}
