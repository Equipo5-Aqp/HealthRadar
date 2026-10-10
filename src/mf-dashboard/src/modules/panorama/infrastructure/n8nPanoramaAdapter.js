// CONTRATO (shape-check manual): POST /api/panorama → webhook n8n "panorama".
//   200 { ok:true, boletin:{anio,semana,fecha_inicio,fecha_fin,fecha_publicacion}|null,
//         cifras:{ dengue_total, dengue_defunciones, ira_total, ira_neumonias, eda_total, eda_disentericas }  (solo claves presentes),
//         tiene_cifras:boolean, alertas:string[], periodos:[{anio,semana}], estado:{boletines_procesados,con_cifras},
//         riesgo:{nivel:'bajo'|'medio'|'alto', detalle:string}|null }
// Referencia: ADR-012 → Contratos entre capas
// mf-dashboard no tiene basePath → las URLs /api/... funcionan directamente.
// PROHIBIDO: import desde fuera de este MF (Regla 1 de gobernanza).

const BASE = ''
const NIVELES = ['bajo', 'medio', 'alto']

async function postJson(ruta, cuerpo) {
  const res = await fetch(`${BASE}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
    credentials: 'same-origin',
  })
  if (res.status === 401) {
    window.location.assign('/login') // sesión vencida (recarga completa, Regla 4)
    throw new Error('Sesión vencida')
  }
  if (!res.ok) throw new Error(`Servidor respondió ${res.status}`)
  return res.json()
}

export async function cargarPanorama(anio, semana) {
  const data = await postJson('/api/panorama', { anio: anio || undefined, semana: semana || undefined })
  if (!data || data.ok !== true) throw new Error('[n8nPanoramaAdapter] Contrato violado: falta "ok"')
  const b = data.boletin
  if (b !== null && (typeof b?.anio !== 'number' || typeof b?.semana !== 'number'))
    throw new Error('[n8nPanoramaAdapter] Contrato violado: boletin sin anio/semana')
  const r = data.riesgo
  return {
    boletin: b ?? null,
    cifras: data.cifras && typeof data.cifras === 'object' ? data.cifras : {},
    tieneCifras: data.tiene_cifras === true,
    alertas: Array.isArray(data.alertas) ? data.alertas.filter((a) => typeof a === 'string') : [],
    periodos: Array.isArray(data.periodos) ? data.periodos : [],
    estado: {
      procesados: Number(data.estado?.boletines_procesados) || 0,
      conCifras: Number(data.estado?.con_cifras) || 0,
    },
    riesgo: r && NIVELES.includes(r.nivel) ? { nivel: r.nivel, detalle: String(r.detalle ?? '') } : null,
  }
}

export async function cargarTendencia(tabla, departamento, anio) {
  const raw = await postJson('/api/tendencia', {
    tabla,
    departamento: departamento || undefined,
    anio: anio || undefined,
  })
  return (Array.isArray(raw) ? raw : []).map((d) => {
    if (!('periodo' in d) || !('total_casos' in d))
      throw new Error('[n8nPanoramaAdapter] Contrato violado: item sin periodo/total_casos')
    return { periodo: Number(d.periodo), total_casos: Number(d.total_casos) || 0 }
  })
}
