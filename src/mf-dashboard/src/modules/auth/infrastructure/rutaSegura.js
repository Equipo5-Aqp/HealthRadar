// Utilidad pura (cliente y servidor): evita el "open redirect" tras el login.
// Solo se aceptan rutas internas del propio sitio.

/** Devuelve `next` si es una ruta interna segura; si no, '/'. */
export function rutaSegura(next) {
  if (typeof next !== 'string') return '/'
  if (!next.startsWith('/')) return '/'
  if (next.startsWith('//') || next.includes('\\') || /[\u0000-\u001f\u007f]/.test(next)) return '/'
  if (next === '/login' || next.startsWith('/login/') || next.startsWith('/login?') || next.startsWith('/api/auth')) return '/'
  return next
}
