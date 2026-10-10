'use client'

import { etiquetaColumna, esNumerica, formatearSinMiles } from '../lib/columnas'
import { formatoNumero } from '@/modules/shared/formato'
import { etiquetaFuente } from '@/modules/shared/constants/fuentes'
import { DEPARTAMENTOS } from '@/modules/shared/constants/departamentos'
import { POR_PAGINA } from '../hooks/useHistoricos'

function celda(clave, valor) {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (esNumerica(valor) && !formatearSinMiles(clave)) return formatoNumero(valor)
  return String(valor)
}

export default function TablaDatos({ h }) {
  const { aplicado, filas, columnas, pagina, cargando, error, consultado } = h
  const dep = DEPARTAMENTOS.find((d) => d.codigo === aplicado.departamento)?.nombre || 'Todos los departamentos'
  const titulo = aplicado.tabla ? `${etiquetaFuente(aplicado.tabla)} · ${dep} · ${aplicado.anio || 'Todos los años'}` : ''
  const hayFiltros = Boolean(aplicado.departamento || aplicado.anio)

  if (!consultado && !cargando) {
    return <div className="state vacio-estado"><b>ANTES DE ELEGIR</b>Selecciona una fuente arriba para ver los datos.</div>
  }
  if (cargando) {
    return (
      <section className="card table-card" aria-busy="true" aria-label="Resultados">
        <div className="table-meta"><h2>{titulo}</h2><span role="status">Cargando datos…</span></div>
        <div className="tabla-esqueleto" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton" />)}</div>
      </section>
    )
  }
  if (error) {
    return <div className="state err" role="alert"><b>ERROR</b>{error.mensaje}</div>
  }
  if (filas.length === 0) {
    return (
      <div className="state vacio-estado">
        <b>SIN RESULTADOS</b>
        {pagina > 1
          ? 'No hay más registros para mostrar.'
          : hayFiltros ? 'No se encontraron registros para el departamento y/o año seleccionados.' : 'No hay registros para esta fuente.'}
        {pagina > 1 && <button type="button" className="btn-ghost" onClick={() => h.irAPagina(pagina - 1)}>← Volver a la página anterior</button>}
      </div>
    )
  }

  const hayMas = filas.length >= POR_PAGINA
  return (
    <section className="card table-card" aria-label="Resultados">
      <div className="table-meta">
        <h2>{titulo}</h2>
        <span>Registros de la base de datos</span>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla de registros, desplazable">
        <table className="data">
          <caption className="sr-only">{`Registros de ${titulo}, página ${pagina}`}</caption>
          <thead>
            <tr>
              {columnas.map((c) => (
                <th key={c} scope="col" className={esNumerica(filas[0][c]) ? 'num' : undefined}>{etiquetaColumna(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>
                {columnas.map((c) => <td key={c} className={esNumerica(f[c]) ? 'num' : undefined}>{celda(c, f[c])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button type="button" className="btn-ghost" disabled={pagina === 1} onClick={() => h.irAPagina(pagina - 1)}>← Anterior</button>
        <span className="pager-label">Página {pagina} · {filas.length} registros</span>
        <button type="button" className="btn-ghost" disabled={!hayMas} onClick={() => h.irAPagina(pagina + 1)}>Siguiente →</button>
      </div>
    </section>
  )
}
