// BFF (ADR-004): el navegador solo habla con esta ruta; la URL de n8n no sale del servidor.
export const dynamic = 'force-dynamic'

const JSON_HDR = { 'Content-Type': 'application/json' }

export async function POST(request) {
  try {
    const body = await request.json()
    const n8nUrl = process.env.N8N_INTERNAL_URL || 'http://n8n:5678'

    const res = await fetch(`${n8nUrl}/webhook/consulta`, {
      method: 'POST',
      headers: JSON_HDR,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
      cache: 'no-store',
    })

    if (!res.ok) {
      // 503 = el flujo agotó la cadena de proveedores de IA y manda un cuerpo limpio {error,codigo,mensaje}
      // (HU-12). Se reenvía tal cual para que el front distinga "IA saturada" de "sin conexión".
      if (res.status === 503) {
        const cuerpo = await res.json().catch(() => null)
        if (cuerpo?.error === true) return new Response(JSON.stringify(cuerpo), { status: 503, headers: JSON_HDR })
      }
      return new Response(JSON.stringify({ error: `n8n respondió con código ${res.status}` }), { status: res.status, headers: JSON_HDR })
    }

    return new Response(JSON.stringify(await res.json()), { status: 200, headers: JSON_HDR })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error interno conectando con n8n: ' + error.message }), { status: 500, headers: JSON_HDR })
  }
}
