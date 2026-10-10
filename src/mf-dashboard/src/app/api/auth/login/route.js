// POST /api/auth/login → n8n /webhook/auth-login. Pone la cookie de sesión (HttpOnly); el token NO llega al JavaScript del navegador.
import {
  cookieSesion, llamarAuth, respuestaJson, tokenValido,
  ERROR_CREDENCIALES, ERROR_FORMATO, ERROR_NO_DISPONIBLE,
} from '@/modules/auth/infrastructure/authServer'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  let body
  try { body = await request.json() } catch { return respuestaJson(400, ERROR_FORMATO) }

  const email = typeof body?.email === 'string' ? body.email : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email || !password || email.length > 254 || password.length > 128) {
    return respuestaJson(400, ERROR_FORMATO)
  }

  // nginx fija X-Real-IP con la IP real del cliente (sobrescribe la que mande el navegador).
  const ip = request.headers.get('x-real-ip') || ''
  const userAgent = request.headers.get('user-agent') || ''

  let r
  try {
    r = await llamarAuth('auth-login', { email, password, ip, user_agent: userAgent })
  } catch {
    return respuestaJson(503, ERROR_NO_DISPONIBLE)
  }

  if (r.status === 200 && r.json?.ok === true && tokenValido(r.json.token)) {
    const usuario = { email: String(r.json.usuario?.email ?? ''), rol: String(r.json.usuario?.rol ?? '') }
    return respuestaJson(200, { ok: true, usuario }, cookieSesion(r.json.token, r.json.expira_en_seg))
  }
  if (r.status === 400) return respuestaJson(400, ERROR_FORMATO)
  if (r.status === 401) return respuestaJson(401, ERROR_CREDENCIALES) // siempre el mismo mensaje
  return respuestaJson(503, ERROR_NO_DISPONIBLE)
}
