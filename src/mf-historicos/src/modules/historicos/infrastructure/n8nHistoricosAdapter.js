// CONTRATO: shape-check manual. Referencia: ADR-012 → Contratos entre capas
// NEXT_PUBLIC_BASEPATH NO se usa como env var: las NEXT_PUBLIC_* se inlinan en
// 'next build', no se leen en runtime desde docker-compose environment.
// Solución elegida: constante literal que debe coincidir con basePath de
// next.config.mjs. Con basePath '/historicos', fetch('/api/historicos')
// llegaría a mf-consulta → 404; con BASE llega a /historicos/api/historicos ✅
const BASE = '/historicos'

export async function cargarHistoricos(tabla, pagina, departamento, anio) {
  const res = await fetch(`${BASE}/api/historicos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tabla, pagina,
      departamento: departamento || undefined,
      anio: anio || undefined,
    }),
  })
  if (!res.ok) throw new Error(`Servidor respondió ${res.status}`)
  const raw = await res.json()
  if (!Array.isArray(raw)) throw new Error('[n8nHistoricosAdapter] Respuesta no es array')
  return raw
}
