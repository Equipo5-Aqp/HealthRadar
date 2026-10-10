// CONTRATO: webhook /consulta (core/contracts/webhook-nlq-{input,output}.schema.json)
//   entrada: { pregunta, sessionId }
//   200:     { output, modelo_usado?, nivel_riesgo?, advertencia_cifras? }
//   503:     { error:true, codigo, mensaje }  (fallaron todos los proveedores de IA, HU-12)
// Referencia: ADR-012 → Contratos entre capas
// PROHIBIDO: import desde fuera de este MF (Regla 1 de gobernanza)
// mf-consulta se sirve bajo basePath '/consulta' (ADR-013): Next NO agrega el prefijo a los fetch
// del navegador, por eso las URLs /api/... deben llevarlo explícito.

const BASE = '/consulta'

// tipo: 'ia'       → los proveedores de IA están saturados o caídos (el servicio sí respondió)
//       'conexion' → el navegador no pudo llegar al servidor (sin red)
//       'servidor' → el servicio respondió con un error o no respondió a tiempo
export class ErrorConsulta extends Error {
  constructor(tipo, mensaje, codigo = null) {
    super(mensaje)
    this.name = 'ErrorConsulta'
    this.tipo = tipo
    this.codigo = codigo
  }
}

export async function consultar(pregunta, sessionId) {
  let res
  try {
    res = await fetch(`${BASE}/api/consulta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pregunta, sessionId }),
    })
  } catch {
    throw new ErrorConsulta('conexion', 'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.')
  }

  if (!res.ok) {
    const cuerpo = await res.json().catch(() => null)
    if (res.status === 503 && cuerpo?.error === true) {
      throw new ErrorConsulta(
        'ia',
        typeof cuerpo.mensaje === 'string' && cuerpo.mensaje
          ? cuerpo.mensaje
          : 'Los proveedores de IA no están disponibles en este momento. Intenta de nuevo en unos segundos.',
        cuerpo.codigo ?? null,
      )
    }
    throw new ErrorConsulta('servidor', `El servicio no pudo responder (código ${res.status}). Inténtalo de nuevo en unos minutos.`)
  }

  const data = await res.json().catch(() => null)
  if (typeof data?.output !== 'string' || !data.output)
    throw new Error('[n8nConsultaAdapter] Contrato violado: falta "output"')
  return {
    output: data.output,
    modelo_usado: typeof data.modelo_usado === 'string' ? data.modelo_usado : null,
    nivel_riesgo: ['alto', 'medio', 'bajo'].includes(data.nivel_riesgo) ? data.nivel_riesgo : null,
    advertencia_cifras: typeof data.advertencia_cifras === 'string' && data.advertencia_cifras ? data.advertencia_cifras : null,
  }
}
