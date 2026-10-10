// Sesión desde mf-consulta. El login vive en mf-dashboard (ADR-014): aquí solo se consulta quién está
// conectado y se cierra la sesión. Las URLs son ABSOLUTAS (sin el basePath '/consulta') a propósito:
// nginx envía /api/auth/* a mf-dashboard y la cookie hr_sesion (Path=/) viaja sola. Es una llamada HTTP
// por la URL pública, no un import entre microfrontends (Regla 1).
// PROHIBIDO: import desde fuera de este MF.

export async function cerrarSesion() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
  } catch {
    /* si no hay red, igual se vuelve al login */
  }
}

/** Quién está conectado: { email, rol } o null si no hay sesión válida / no se pudo consultar. */
export async function obtenerUsuario() {
  try {
    const res = await fetch('/api/auth/sesion', { credentials: 'same-origin', cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    return data?.ok === true && data.usuario?.email ? data.usuario : null
  } catch {
    return null
  }
}
