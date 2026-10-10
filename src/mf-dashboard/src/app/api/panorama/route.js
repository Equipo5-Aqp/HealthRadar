// BFF (ADR-004): el navegador solo habla con esta ruta; la URL de n8n no sale del servidor.
export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const n8nUrl = process.env.N8N_INTERNAL_URL || 'http://n8n:5678'

    const res = await fetch(`${n8nUrl}/webhook/panorama`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    })

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `n8n respondió con código ${res.status}` }), {
        status: res.status, headers: { 'Content-Type': 'application/json' },
      })
    }
    return Response.json(await res.json(), { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error interno conectando con n8n: ' + error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
