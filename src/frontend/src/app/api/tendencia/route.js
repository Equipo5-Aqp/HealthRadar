// src/app/api/tendencia/route.js
//
// Proxy hacia el webhook de n8n /webhook/tendencia.
// Mismo patron que src/app/api/historicos/route.js: recibe el body del
// frontend, lo reenvia tal cual a n8n, y devuelve la respuesta tal cual.
// Si tu route.js de historicos usa una URL base distinta (ej. variable de
// entorno N8N_URL), reemplaza la URL de abajo por el mismo patron.

export async function POST(request) {
  const body = await request.json()

  const res = await fetch('http://n8n:5678/webhook/tendencia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await res.json()

  return Response.json(data, { status: res.status })
}