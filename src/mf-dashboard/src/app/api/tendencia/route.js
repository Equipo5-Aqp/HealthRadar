// BFF (ADR-004): reenvía a n8n /webhook/tendencia. Copia propia de este MF (ADR-013).
export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const body = await request.json()
    const n8nUrl = process.env.N8N_INTERNAL_URL || 'http://n8n:5678'
    const res = await fetch(`${n8nUrl}/webhook/tendencia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    })
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `n8n respondió ${res.status}` }), {
        status: res.status, headers: { 'Content-Type': 'application/json' },
      })
    }
    return Response.json(await res.json(), { status: 200 })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error conectando con n8n: ' + error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
