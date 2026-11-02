// Exportar a CSV (HU6). Puro, sin React ni navegador: se prueba aparte.
import { etiquetaColumna } from './columnas'

const SOLO_NUMERO = /^-?\d+(\.\d+)?$/

/** Valor de una celda ya listo para el CSV (con comillas si hace falta). Vacío si no hay dato. */
export function celdaCsv(valor) {
  if (valor === null || valor === undefined) return ''
  let t = String(valor)
  // Protección contra fórmulas: Excel ejecuta como fórmula un texto que empieza con = + - @ (o tab/enter).
  // Los números (también los que llegan como texto, p. ej. "-5") se dejan como están.
  if (typeof valor === 'string' && /^[=+\-@\t\r]/.test(t) && !SOLO_NUMERO.test(t)) t = `'${t}`
  return /[",\r\n]/.test(t) || t !== t.trim() ? `"${t.replace(/"/g, '""')}"` : t
}

/** CSV de la tabla tal como se ve: encabezados con el nombre legible y valores sin formato (sin separador de miles). */
export function filasACsv(columnas, filas) {
  const lineas = [columnas.map((c) => celdaCsv(etiquetaColumna(c))).join(',')]
  for (const f of filas) lineas.push(columnas.map((c) => celdaCsv(f[c])).join(','))
  return lineas.join('\r\n') + '\r\n'
}

const slug = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** historicos_dengue_piura_2024_pag1.csv · sin filtros: historicos_eda_todos_todos_pag3.csv */
export function nombreArchivoCsv({ tabla, departamento, anio, pagina }) {
  return `historicos_${slug(tabla) || 'datos'}_${slug(departamento) || 'todos'}_${slug(anio) || 'todos'}_pag${pagina}.csv`
}
