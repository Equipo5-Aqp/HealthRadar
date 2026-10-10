// POST /api/auth/logout → revoca la sesión en n8n y borra la cookie. Siempre responde 200 (idempotente).
import { NOMBRE_COOKIE, cookieBorrada, llamarAuth, respuestaJson, tokenValido } from '@/modules/auth/infrastructure/authServer'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  const token = request.cookies.get(NOMBRE_COOKIE)?.value
  if (tokenValido(token)) {
    try { await llamarAuth('auth-logout', { token }) } catch { /* si n8n no responde, igual se borra la cookie */ }
  }
  return respuestaJson(200, { ok: true }, cookieBorrada())
}
