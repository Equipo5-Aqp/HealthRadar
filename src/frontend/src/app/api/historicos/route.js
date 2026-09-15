export async function POST(request) {
  try {
    const body = await request.json()
    const n8nUrl = process.env.N8N_INTERNAL_URL || 'http://n8n:5678'

    const res = await fetch(`${n8nUrl}/webhook/historicos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `n8n respondió con código ${res.status}` }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const data = await res.json()
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error interno conectando con n8n: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}