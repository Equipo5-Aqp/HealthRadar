'use client'

import { formatoNumero } from '@/modules/shared/formato'

// SVG del mapa. Cada departamento es un botón accesible (teclado + lector de pantalla); el color nunca va solo:
// el valor está en el <title>, en el aria-label y en la tabla de debajo.
export default function MapaPeru({ geo, calculo, seleccion, onElegir }) {
  const deps = [...geo.deps].sort((a, b) => (a.codigo === seleccion) - (b.codigo === seleccion)) // el elegido se dibuja encima
  return (
    <svg className="mapa-svg" viewBox={`0 0 ${geo.ancho} ${geo.alto}`} role="group" aria-label="Mapa de calor del Perú por departamento">
      {deps.map((d) => {
        const dato = calculo.porCodigo.get(d.codigo)
        const total = dato ? dato.total : 0
        const nivel = calculo.escala.nivel(total)
        const texto = `${d.nombre}: ${formatoNumero(total)} casos`
        return (
          <path
            key={d.codigo} d={d.d} fillRule="evenodd"
            className={`dep${d.codigo === seleccion ? ' sel' : ''}`} data-l={nivel}
            tabIndex={0} role="button" aria-label={texto} aria-pressed={d.codigo === seleccion}
            onClick={() => onElegir(d.codigo)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onElegir(d.codigo) } }}
          >
            <title>{texto}</title>
          </path>
        )
      })}
    </svg>
  )
}
