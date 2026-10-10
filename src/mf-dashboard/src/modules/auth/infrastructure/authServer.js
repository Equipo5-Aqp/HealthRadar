// SOLO SERVIDOR (rutas /api/auth/*). Llama a los webhooks de autenticación de n8n y arma la cookie.
// El navegador nunca ve la URL de n8n ni el secreto compartido (ADR-004).
// PROHIBIDO: import desde fuera de este MF (Regla 1 de gobernanza, ADR-013).

export const NOMBRE_COOKIE = 'hr_sesion'

const RE_TOKEN = /^[0-9a-f]{64}$/
const TTL_DEFECTO_SEG = 8 * 60 * 60

/** Token de sesión con el formato que genera el core (64 hex). */
export function tokenValido(token) {
  return typeof token === 'string' && RE_TOKEN.test(token)
}

// La cookie lleva Secure solo si AUTH_COOKIE_SECURE=true. Con HTTP plano (despliegue actual:
// nginx en :3000 sin TLS) un navegador DESCARTA las cookies Secure y nadie podría entrar.
// La decisión TLS vs. riesgo aceptado está pendiente en el ADR-014: no se activa a ciegas.
function atributosComunes() {
  const partes = ['HttpOnly', 'SameSite=Lax', 'Path=/']
  if (process.env.AUTH_COOKIE_SECURE === 'true') partes.push('Secure')
  return partes
}

export function cookieSesion(token, expiraEnSeg) {
  const n = Number(expiraEnSeg)
  const maxAge = Number.isFinite(n) && n >= 60 && n <= 86400 ? Math.floor(n) : TTL_DEFECTO_SEG
  return [`${NOMBRE_COOKIE}=${token}`, ...atributosComunes(), `Max-Age=${maxAge}`].join('; ')
}

export function cookieBorrada() {
  return [`${NOMBRE_COOKIE}=`, ...atributosComunes(), 'Max-Age=0'].join('; ')
}

/** Respuesta JSON sin caché (nada de esto debe quedar en caches intermedias). */
export function respuestaJson(status, cuerpo, cookie) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  if (cookie) headers.append('Set-Cookie', cookie)
  return new Response(JSON.stringify(cuerpo), { status, headers })
}

export const ERROR_FORMATO = { ok: false, error: true, codigo: 'FORMATO_INVALIDO', mensaje: 'Solicitud inválida' }
export const ERROR_CREDENCIALES = { ok: false, error: true, codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Credenciales inválidas' }
export const ERROR_NO_DISPONIBLE = {
  ok: false, error: true, codigo: 'AUTH_NO_DISPONIBLE',
  mensaje: 'No se pudo completar la autenticación. Intenta nuevamente.',
}

/**
 * POST a un webhook de autenticación de n8n con el secreto compartido.
 * Devuelve { status, json }. Lanza si n8n no responde (el llamador responde 503).
 */
export async function llamarAuth(ruta, cuerpo) {
  const secreto = process.env.AUTH_WEBHOOK_SECRET || ''
  if (!secreto) {
    // Falla cerrado y avisa en el log del servidor (sin imprimir ningún valor).
    console.error('[auth] AUTH_WEBHOOK_SECRET no está definida en mf-dashboard')
    throw new Error('AUTH_WEBHOOK_SECRET vacía')
  }
  const base = process.env.N8N_INTERNAL_URL || 'http://n8n:5678'
  const res = await fetch(`${base}/webhook/${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-secret': secreto },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}
