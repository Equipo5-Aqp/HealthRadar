// Sprint 4 · HU4 — hasta cuándo llegan los datos y si están al día.
// El estado no depende solo del color: siempre va con texto («Al día», «Desactualizado», «Sin datos»).

const ETIQUETA = { al_dia: 'Al día', desactualizado: 'Desactualizado', sin_datos: 'Sin datos' }

// Chip bajo el título: «Datos hasta SE 38 · 2025 · Desactualizado». Es del sistema, no del período elegido.
export function ChipFrescura({ frescura }) {
  if (!frescura) return null
  const { anio, semana } = frescura.boletines
  const texto = anio != null && semana != null ? `Datos hasta SE ${semana} · ${anio}` : 'Sin boletines procesados'
  return (
    <span className={`chip-frescura ${frescura.estado}`} title={frescura.mensaje || undefined}>
      <i aria-hidden="true" />
      {texto}
      <b>{ETIQUETA[frescura.estado]}</b>
    </span>
  )
}

// Aviso visible solo si los datos están desactualizados.
export function AvisoFrescura({ frescura }) {
  if (!frescura || frescura.estado !== 'desactualizado') return null
  const n = frescura.boletines.pendientes
  const pendientes = n > 0 ? `. Hay ${n} ${n === 1 ? 'boletín' : 'boletines'} por procesar.` : ''
  return (
    <div className="aviso" role="status">
      {frescura.mensaje || 'Datos desactualizados'}
      {pendientes}
    </div>
  )
}
