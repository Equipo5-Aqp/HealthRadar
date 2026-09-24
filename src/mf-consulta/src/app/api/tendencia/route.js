// CORREGIDO vs src/frontend/src/app/api/tendencia/route.js:
//  - usa process.env.N8N_INTERNAL_URL (original hardcodeaba http://n8n:5678)
//  - añade try/catch y manejo de !res.ok (original no tenía)
export async function POST(request) {
  try {
    const body = await request.json()
    const n8nUrl = process.env.N8N_INTERNAL_URL || 'http://n8n:5678'
    const res = await fetch(`${n8nUrl}/webhook/tendencia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
