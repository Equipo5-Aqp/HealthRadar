'use client'

import { useRef, useState } from 'react'
import { formatoNumero } from '@/modules/shared/formato'

const fmtPct = (n) => n.toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// SVG del mapa. Cada departamento es un botón accesible (teclado + lector de pantalla); el color nunca va solo:
// el valor está en el aria-label, en el recuadro que aparece al pasar el mouse o enfocar, y en la tabla de debajo.
// Sprint 4 · HU7: recuadro propio (antes era el <title> del navegador), departamento que se «levanta» al pasar el mouse,
// pulso al elegir y entrada escalonada. Las animaciones solo corren si el usuario no pidió reducir el movimiento (CSS).
export default function MapaPeru({ geo, calculo, seleccion, onElegir }) {
  const caja = useRef(null)
  const [tip, setTip] = useState(null) // { codigo, x, y, izq }
  const deps = [...geo.deps].sort((a, b) => (a.codigo === seleccion) - (b.codigo === seleccion)) // el elegido se dibuja encima
  const orden = new Map(geo.deps.map((d, i) => [d.codigo, i])) // posición original: define el retraso de la entrada
  const resaltado = tip ? geo.deps.find((d) => d.codigo === tip.codigo) : null
  const elegido = seleccion ? geo.deps.find((d) => d.codigo === seleccion) : null
  const nivelDe = (codigo) => calculo.escala.nivel(calculo.porCodigo.get(codigo)?.total ?? 0)

  const sobre = (e, codigo) => {
    const r = caja.current.getBoundingClientRect()
    setTip({ codigo, x: e.clientX - r.left, y: e.clientY - r.top, izq: e.clientX - r.left > r.width / 2 })
  }
  const foco = (e, codigo) => {
    const r = caja.current.getBoundingClientRect()
    const b = e.currentTarget.getBoundingClientRect()
    const x = b.left + b.width / 2 - r.left
    setTip({ codigo, x, y: b.top + b.height / 2 - r.top, izq: x > r.width / 2 })
  }

  const dato = tip ? calculo.porCodigo.get(tip.codigo) : null
  const pct = dato && calculo.totalNacional > 0 ? (dato.total / calculo.totalNacional) * 100 : 0

  return (
    <div className="mapa-wrap" ref={caja}>
      <svg className="mapa-svg" viewBox={`0 0 ${geo.ancho} ${geo.alto}`} role="group" aria-label="Mapa de calor del Perú por departamento" onMouseLeave={() => setTip(null)}>
        {deps.map((d) => {
          const fila = calculo.porCodigo.get(d.codigo)
          const total = fila ? fila.total : 0
          const texto = `${d.nombre}: ${formatoNumero(total)} casos`
          return (
            <path
              key={d.codigo} d={d.d} fillRule="evenodd" style={{ '--i': orden.get(d.codigo) }}
              className={`dep${d.codigo === seleccion ? ' sel' : ''}`} data-l={nivelDe(d.codigo)}
              tabIndex={0} role="button" aria-label={texto} aria-pressed={d.codigo === seleccion}
              onClick={() => onElegir(d.codigo)}
              onMouseEnter={(e) => sobre(e, d.codigo)} onMouseMove={(e) => sobre(e, d.codigo)}
              onFocus={(e) => foco(e, d.codigo)} onBlur={() => setTip(null)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onElegir(d.codigo) } }}
            />
          )
        })}
        {/* Pulso al elegir un departamento (se repite el efecto en cada selección nueva). */}
        {elegido && <path key={`p-${elegido.codigo}`} className="dep-pulso" d={elegido.d} fillRule="evenodd" aria-hidden="true" />}
        {/* Copia del departamento bajo el mouse, dibujada encima de sus vecinos y un poco más grande (no recibe clics). */}
        {resaltado && resaltado.codigo !== seleccion && (
          <path key={`h-${resaltado.codigo}`} className="dep-borde" d={resaltado.d} fillRule="evenodd" data-l={nivelDe(resaltado.codigo)} aria-hidden="true" />
        )}
      </svg>
      {tip && dato && (
        <div className={`mapa-tip${tip.izq ? ' izq' : ''}`} style={{ left: tip.x, top: tip.y }} aria-hidden="true">
          <strong>{dato.nombre}</strong>
          <span className="mapa-tip-casos">{formatoNumero(dato.total)} casos</span>
          <span className="mapa-tip-meta">{`${fmtPct(pct)} % del total · ${calculo.puesto.get(dato.codigo)}.º de 25`}</span>
        </div>
      )}
    </div>
  )
}
