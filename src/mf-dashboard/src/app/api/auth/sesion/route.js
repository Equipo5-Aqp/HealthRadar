// GET /api/auth/sesion → n8n /webhook/auth-sesion.
// Lo usa nginx (auth_request) para proteger las páginas y el propio front para saber quién está conectado.
import {
  NOMBRE_COOKIE, llamarAuth, respuestaJson, tokenValido,
  ERROR_CREDENCIALES, ERROR_NO_DISPONIBLE,
} from '@/modules/auth/infrastructure/authServer'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const token = request.cookies.get(NOMBRE_COOKIE)?.value
  if (!tokenValido(token)) return respuestaJson(401, ERROR_CREDENCIALES)

  let r
  try { r = await llamarAuth('auth-sesion', { token }) } catch { return respuestaJson(503, ERROR_NO_DISPONIBLE) }

  if (r.status === 200 && r.json?.ok === true) {
    const usuario = { email: String(r.json.usuario?.email ?? ''), rol: String(r.json.usuario?.rol ?? '') }
    return respuestaJson(200, { ok: true, usuario })
  }
  if (r.status === 401) return respuestaJson(401, ERROR_CREDENCIALES)
  return respuestaJson(503, ERROR_NO_DISPONIBLE)
}
