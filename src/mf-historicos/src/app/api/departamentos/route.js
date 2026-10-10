// BFF (ADR-004) → webhook /departamentos (HU-5): casos por cada uno de los 25 departamentos.
export const dynamic = 'force-dynamic'
const JSON_HDR = { 'Content-Type': 'application/json' }

export async function POST(request) {
  try {
    const body = await request.json()
    const n8nUrl = process.env.N8N_INTERNAL_URL || 'http://n8n:5678'
    const res = await fetch(`${n8nUrl}/webhook/departamentos`, {
      method: 'POST',
      headers: JSON_HDR,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
      cache: 'no-store',
    })
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `n8n respondió con código ${res.status}` }), { status: res.status, headers: JSON_HDR })
    }
    return new Response(JSON.stringify(await res.json()), { status: 200, headers: JSON_HDR })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error interno conectando con n8n: ' + error.message }), { status: 500, headers: JSON_HDR })
  }
}
