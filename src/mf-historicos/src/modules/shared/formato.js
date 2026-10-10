// Utilidades puras de presentación (sin dependencias).

/** 35423 → "35 423" (espacio fino sin salto, como en los boletines). null/undefined → "—". */
export function formatoNumero(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** ('2025-06-22','2025-06-28') → "22 al 28 de junio" (o "29 de junio al 5 de julio"). '' si no son fechas válidas. */
export function rangoFechas(inicio, fin) {
  const re = /^(\d{4})-(\d{2})-(\d{2})$/
  const a = re.exec(inicio || '')
  const b = re.exec(fin || '')
  if (!a || !b) return ''
  const mi = MESES[Number(a[2]) - 1]
  const mf = MESES[Number(b[2]) - 1]
  if (!mi || !mf) return ''
  return a[2] === b[2]
    ? `${Number(a[3])} al ${Number(b[3])} de ${mf}`
    : `${Number(a[3])} de ${mi} al ${Number(b[3])} de ${mf}`
}
