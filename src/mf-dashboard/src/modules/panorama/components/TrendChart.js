import { formatoNumero } from '@/modules/shared/formato'

const W = 600, H = 240
const X0 = 40, X1 = 580   // área de trazado
const Y0 = 30, Y1 = 200   // y máximo (arriba) y cero (abajo)

// Redondea el máximo a una cifra "bonita" para las marcas del eje.
function techoBonito(max) {
  if (max <= 0) return 1
  const exp = Math.pow(10, Math.floor(Math.log10(max)))
  const m = max / exp
  const paso = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10
  return paso * exp
}

// `datos`: [{periodo, total_casos}] ordenado. `porSemana`: periodo = semana epidemiológica; si no, año.
export default function TrendChart({ datos, porSemana, etiquetaSerie }) {
  if (!datos.length) return null
  const techo = techoBonito(Math.max(...datos.map((d) => d.total_casos)))
  const n = datos.length
  const x = (i) => (n === 1 ? (X0 + X1) / 2 : X0 + (i * (X1 - X0)) / (n - 1))
  const y = (v) => Y1 - (v / techo) * (Y1 - Y0)
  const puntos = datos.map((d, i) => `${x(i).toFixed(1)},${y(d.total_casos).toFixed(1)}`).join(' ')

  const iPico = datos.reduce((mejor, d, i) => (d.total_casos > datos[mejor].total_casos ? i : mejor), 0)
  const pico = datos[iPico]
  const pre = porSemana ? 'SE ' : ''
  const primero = datos[0]
  const ultimo = datos[n - 1]
  const iMedio = Math.floor((n - 1) / 2)
  const etiquetasX = n === 1 ? [0] : n === 2 ? [0, 1] : [0, iMedio, n - 1]
  const pegado = x(iPico) > X1 - 140 // el rótulo del pico se alinea a la derecha cerca del borde

  const resumen =
    `${etiquetaSerie}: ${formatoNumero(primero.total_casos)} en ${pre}${primero.periodo}, ` +
    `pico de ${formatoNumero(pico.total_casos)} en ${pre}${pico.periodo} y ${formatoNumero(ultimo.total_casos)} en ${pre}${ultimo.periodo}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={resumen} style={{ display: 'block', maxHeight: 300 }}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line className="chart-line" x1={X0} y1={Y1 - f * (Y1 - Y0)} x2={X1} y2={Y1 - f * (Y1 - Y0)} />
          <text className="chart-txt" x={X0 - 6} y={Y1 - f * (Y1 - Y0) + 4} textAnchor="end">{formatoNumero(techo * f)}</text>
        </g>
      ))}
      <polyline className="chart-series" points={puntos} />
      <circle className="chart-dot" cx={x(0)} cy={y(primero.total_casos)} r="4" />
      <circle className="chart-dot" cx={x(iPico)} cy={y(pico.total_casos)} r="5" />
      <circle className="chart-dot" cx={x(n - 1)} cy={y(ultimo.total_casos)} r="4" />
      <text className="chart-peak" x={pegado ? x(iPico) - 10 : x(iPico) + 10} y={Math.max(y(pico.total_casos) - 8, 14)} textAnchor={pegado ? 'end' : 'start'}>
        {`Pico · ${pre}${pico.periodo} · ${formatoNumero(pico.total_casos)}`}
      </text>
      {etiquetasX.map((i) => (
        <text key={i} className="chart-txt" x={x(i)} y={222} textAnchor="middle">{`${pre}${datos[i].periodo}`}</text>
      ))}
    </svg>
  )
}
