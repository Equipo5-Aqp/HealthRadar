// CONTRATO: POST /api/auth/login → { ok, usuario:{email,rol} } | { ok:false, codigo, mensaje }
// El token de sesión viaja en una cookie HttpOnly: este código nunca lo ve.
// mf-dashboard no tiene basePath (atiende la raíz) → las URLs /api/... funcionan directamente.
// PROHIBIDO: import desde fuera de este MF (Regla 1 de gobernanza).

const BASE = ''

const MENSAJES = {
  400: 'Revisa el correo y la contraseña.',
  401: 'Correo o contraseña incorrectos. Tras varios intentos fallidos la cuenta se bloquea unos minutos.',
  429: 'Demasiados intentos seguidos. Espera un minuto e inténtalo de nuevo.',
}
const MENSAJE_GENERAL = 'No se pudo iniciar sesión en este momento. Inténtalo de nuevo en unos minutos.'

export async function iniciarSesion(email, password) {
  try {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'same-origin',
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.ok === true) return { ok: true, usuario: data.usuario ?? null }
    return { ok: false, mensaje: MENSAJES[res.status] ?? MENSAJE_GENERAL }
  } catch {
    return { ok: false, mensaje: MENSAJE_GENERAL }
  }
}

export async function cerrarSesion() {
  try {
    await fetch(`${BASE}/api/auth/logout`, { method: 'POST', credentials: 'same-origin' })
  } catch {
    /* si no hay red, igual se vuelve al login */
  }
}

/** Quién está conectado: { email, rol } o null si no hay sesión válida / no se pudo consultar. */
export async function obtenerUsuario() {
  try {
    const res = await fetch(`${BASE}/api/auth/sesion`, { credentials: 'same-origin', cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    return data?.ok === true && data.usuario?.email ? data.usuario : null
  } catch {
    return null
  }
}
