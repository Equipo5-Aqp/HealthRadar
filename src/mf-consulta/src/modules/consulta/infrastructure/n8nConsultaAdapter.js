// CONTRATO: shape-check manual sincronizado con webhook-nlq-output.schema.json
// Referencia: ADR-012 → Contratos entre capas
// PROHIBIDO: import desde fuera de este MF (Regla 1 de gobernanza)
// mf-consulta no tiene basePath → las URLs /api/... funcionan directamente.

const BASE = ''

export async function consultar(pregunta) {
  const res = await fetch(`${BASE}/api/consulta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pregunta }),
  })
  if (!res.ok) throw new Error(`Servidor respondió ${res.status}`)
  const data = await res.json()
  if (typeof data.output !== 'string' || !data.output)
    throw new Error('[n8nConsultaAdapter] Contrato violado: falta "output"')
  return {
    output: data.output,
    modelo_usado: data.modelo_usado ?? null,
    nivel_riesgo: data.nivel_riesgo ?? null,
  }
}

export async function cargarTendencia(tabla, anio) {
  const res = await fetch(`${BASE}/api/tendencia`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tabla, anio: anio || undefined }),
  })
  if (!res.ok) throw new Error(`Servidor respondió ${res.status}`)
  const raw = await res.json()
  return (Array.isArray(raw) ? raw : []).map((d) => {
    if (!('periodo' in d) || !('total_casos' in d))
      throw new Error('[n8nConsultaAdapter] Contrato violado: item sin periodo/total_casos')
    return { periodo: d.periodo, total_casos: Number(d.total_casos) || 0 }
  })
}
