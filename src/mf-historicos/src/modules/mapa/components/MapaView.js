'use client'

import Sidebar from '@/modules/shared/components/Sidebar'
import { FUENTES, ANIO_MIN_CASOS, ANIO_MAX_CASOS, etiquetaFuente } from '@/modules/shared/constants/fuentes'
import { formatoNumero } from '@/modules/shared/formato'
import { NIVELES } from '../lib/escala'
import { useMapa } from '../hooks/useMapa'
import MapaPeru from './MapaPeru'

const ANIOS = Array.from({ length: ANIO_MAX_CASOS - ANIO_MIN_CASOS + 1 }, (_, i) => ANIO_MAX_CASOS - i)

function Detalle({ m }) {
  const dato = m.seleccion ? m.calculo?.porCodigo.get(m.seleccion) : null
  const nombre = dato?.nombre || m.geo?.deps.find((d) => d.codigo === m.seleccion)?.nombre
  const periodo = m.anio || 'todos los años'
  if (!m.seleccion || !dato) {
    return (
      <aside className="card detail" aria-label="Detalle del departamento">
        <div><div className="detail-kicker">Departamento seleccionado</div><h2>—</h2></div>
        <p className="detail-hint">Elige un departamento en el mapa o en la tabla para ver su detalle.</p>
      </aside>
    )
  }
  const pct = m.calculo.totalNacional > 0 ? (dato.total / m.calculo.totalNacional) * 100 : 0
  const enlace = `/historicos?tabla=${encodeURIComponent(m.tabla)}&departamento=${encodeURIComponent(m.seleccion)}${m.anio ? `&anio=${encodeURIComponent(m.anio)}` : ''}`
  return (
    <aside className="card detail" aria-label="Detalle del departamento" aria-live="polite">
      <div><div className="detail-kicker">Departamento seleccionado</div><h2>{nombre}</h2></div>
      <dl>
        <div className="dl-row"><dt>{`Casos acumulados (${periodo})`}</dt><dd>{formatoNumero(dato.total)}</dd></div>
        <div className="dl-row"><dt>Participación en el total nacional</dt><dd>{pct.toLocaleString('es-PE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %</dd></div>
        <div className="dl-row"><dt>Puesto entre los 25 departamentos</dt><dd>{m.calculo.puesto.get(dato.codigo)}.º</dd></div>
      </dl>
      <a href={enlace} className="btn-primary">{`Ver los registros de ${nombre}`}</a>
    </aside>
  )
}

export default function MapaView() {
  const m = useMapa()
  const sinCasos = m.calculo && m.calculo.totalNacional === 0

  return (
    <div className="app">
      <Sidebar actual="mapa" />
      <main className="main">
        <header className="page-head block">
          <h1>Mapa de calor</h1>
          <p>Casos acumulados por departamento. Elige un departamento para ver su detalle.</p>
        </header>

        <section className="filters" aria-label="Filtros">
          <div className="field">
            <label htmlFor="m-fuente">Fuente de información</label>
            <select id="m-fuente" className="select fuente" value={m.tabla} onChange={(e) => m.setTabla(e.target.value)}>
              {FUENTES.map((f) => <option key={f.valor} value={f.valor}>{f.etiqueta}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="m-anio">Año</label>
            <select id="m-anio" className="select" value={m.anio} onChange={(e) => m.setAnio(e.target.value)}>
              <option value="">Todos los años</option>
              {ANIOS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <p className="filters-note">Los casos por departamento llegan hasta {ANIO_MAX_CASOS}.</p>
        </section>

        <div className="row">
          <section className="card map-card" aria-label="Mapa por departamento" aria-busy={m.cargando}>
            {m.error && <div className="error-box" role="alert">{m.error}</div>}
            {m.errorGeo && <div className="error-box" role="alert">{m.errorGeo}</div>}
            {!m.error && !m.errorGeo && (m.cargando || !m.geo || !m.calculo) && (
              <div className="mapa-esqueleto skeleton" role="status"><span className="sr-only">Cargando el mapa…</span></div>
            )}
            {sinCasos && !m.cargando && <div className="aviso" role="status">No hay casos registrados para esta selección.</div>}
            {m.geo && m.calculo && !m.error && (
              <div className={m.cargando ? 'mapa-caja cargando' : 'mapa-caja'}>
                <MapaPeru geo={m.geo} calculo={m.calculo} seleccion={m.seleccion} onElegir={m.setSeleccion} />
              </div>
            )}
            {m.calculo && !m.error && (
              <div className="legend">
                <div className="legend-scale">
                  <span>Menos casos</span>
                  {Array.from({ length: NIVELES }, (_, i) => <span key={i} className={`sw s${i}`} aria-hidden="true" />)}
                  <span>Más casos</span>
                </div>
                <span>{`${etiquetaFuente(m.tabla)} · ${m.anio || 'todos los años'} · casos acumulados, no tasa por habitante`}</span>
              </div>
            )}
          </section>
          <Detalle m={m} />
        </div>

        {m.calculo && !m.error && (
          <details className="card ranking">
            <summary>Ver los casos de los 25 departamentos como tabla</summary>
            <p className="note-small">Cada color agrupa unos 5 departamentos, ordenados de menos a más casos.</p>
            <div className="table-wrap" tabIndex={0} role="region" aria-label="Casos por departamento, desplazable">
              <table className="data">
                <caption className="sr-only">{`Casos de ${etiquetaFuente(m.tabla)} por departamento, ${m.anio || 'todos los años'}`}</caption>
                <thead><tr><th scope="col" className="num">Puesto</th><th scope="col">Departamento</th><th scope="col" className="num">Casos</th><th scope="col" className="num">Participación</th></tr></thead>
                <tbody>
                  {m.calculo.ordenados.map((d, i) => (
                    <tr key={d.codigo} className={d.codigo === m.seleccion ? 'fila-sel' : undefined}>
                      <td className="num">{i + 1}</td>
                      <td><button type="button" className="link-btn" onClick={() => m.setSeleccion(d.codigo)}>{d.nombre}</button></td>
                      <td className="num">{formatoNumero(d.total)}</td>
                      <td className="num">{m.calculo.totalNacional > 0 ? ((d.total / m.calculo.totalNacional) * 100).toLocaleString('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '0,0'} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </main>
    </div>
  )
}
