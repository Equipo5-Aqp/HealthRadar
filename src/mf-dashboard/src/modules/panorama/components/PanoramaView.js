'use client'

import { usePanorama } from '../hooks/usePanorama'
import { useTendenciaPanorama } from '../hooks/useTendenciaPanorama'
import Kpis from './Kpis'
import TrendChart from './TrendChart'
import { ENFERMEDADES, ANIO_MIN_CASOS, ANIO_MAX_CASOS } from '@/modules/shared/constants/enfermedades'
import { DEPARTAMENTOS } from '@/modules/shared/constants/departamentos'
import { rangoFechas } from '@/modules/shared/formato'

const ANIOS = []
for (let a = ANIO_MAX_CASOS; a >= ANIO_MIN_CASOS; a--) ANIOS.push(a)

export default function PanoramaView() {
  const p = usePanorama()
  const t = useTendenciaPanorama()
  const d = p.datos
  const b = d?.boletin

  const rango = b ? rangoFechas(b.fecha_inicio, b.fecha_fin) : ''
  const subtitulo = p.cargando && !d
    ? 'Cargando el último boletín…'
    : b
      ? `Perú · acumulado del año al Boletín SE ${b.semana}-${b.anio}${rango ? ` (${rango})` : ''}`
      : 'Aún no hay boletines procesados'

  const enf = ENFERMEDADES.find((e) => e.valor === t.enfermedad)?.etiqueta ?? ''
  const dep = DEPARTAMENTOS.find((x) => x.codigo === t.departamento)?.nombre ?? ''
  const valorPeriodo = p.periodo || (b ? `${b.anio}-${b.semana}` : '')

  return (
    <main className="main">
      <header className="page-head">
        <div>
          <h1>Panorama epidemiológico</h1>
          <p>{subtitulo}</p>
        </div>
        {d?.periodos?.length > 0 && (
          <div className="field">
            <label htmlFor="p-periodo">Período</label>
            <select id="p-periodo" className="select" value={valorPeriodo} onChange={(e) => p.elegirPeriodo(e.target.value)} disabled={p.cargando}>
              {d.periodos.map((x) => (
                <option key={`${x.anio}-${x.semana}`} value={`${x.anio}-${x.semana}`}>{`SE ${x.semana} · ${x.anio}`}</option>
              ))}
            </select>
          </div>
        )}
      </header>

      {p.error && (
        <div className="error-box" role="alert">
          {p.error}{' '}
          <button type="button" className="btn-primary" style={{ display: 'inline-flex', minHeight: 32, padding: '0 12px', marginLeft: 8 }} onClick={p.reintentar}>Reintentar</button>
        </div>
      )}

      {d && b && !d.tieneCifras && (
        <div className="aviso" role="status">
          Este boletín se resumió antes de que existiera la verificación de cifras. Los totales aparecerán cuando se vuelva a procesar.
        </div>
      )}

      {p.cargando && !d ? (
        <section className="kpis" aria-busy="true" aria-label="Cargando indicadores">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 118 }} />)}
        </section>
      ) : (
        !p.error && <Kpis cifras={d?.cifras} riesgo={d?.riesgo} />
      )}

      <div className="row">
        <section className="card trend" aria-label="Tendencia">
          <div className="trend-head">
            <div>
              <h2>{`Tendencia ${t.anio ? 'semanal' : 'anual'} · ${enf}`}</h2>
              <p>{`${dep} · ${t.anio ? t.anio : `histórico ${ANIO_MIN_CASOS}–${ANIO_MAX_CASOS}`}`}</p>
            </div>
            <div className="trend-controls">
              <div><label className="sr-only" htmlFor="t-enf">Enfermedad</label>
                <select id="t-enf" className="select sm" value={t.enfermedad} onChange={(e) => t.setEnfermedad(e.target.value)}>
                  {ENFERMEDADES.map((e) => <option key={e.valor} value={e.valor}>{e.etiqueta}</option>)}
                </select></div>
              <div><label className="sr-only" htmlFor="t-dep">Departamento</label>
                <select id="t-dep" className="select sm" value={t.departamento} onChange={(e) => t.setDepartamento(e.target.value)}>
                  {DEPARTAMENTOS.map((x) => <option key={x.codigo} value={x.codigo}>{x.nombre}</option>)}
                </select></div>
              <div><label className="sr-only" htmlFor="t-anio">Año</label>
                <select id="t-anio" className="select sm" value={t.anio} onChange={(e) => t.setAnio(e.target.value)}>
                  <option value="">Todos los años</option>
                  {ANIOS.map((a) => <option key={a} value={String(a)}>{a}</option>)}
                </select></div>
            </div>
          </div>
          {t.cargando && <div className="skeleton" style={{ height: 240 }} aria-busy="true" />}
          {!t.cargando && t.error && <div className="error-box" role="alert">{t.error}</div>}
          {!t.cargando && !t.error && t.datos.length === 0 && (
            <div className="vacio-msg">No hay casos registrados para esta selección. Los registros por departamento llegan hasta {ANIO_MAX_CASOS}.</div>
          )}
          {!t.cargando && !t.error && t.datos.length > 0 && (
            <TrendChart datos={t.datos} porSemana={!!t.anio} etiquetaSerie={`Casos de ${enf} en ${dep}${t.anio ? ` ${t.anio}` : ''}`} />
          )}
        </section>

        <div className="side-cards">
          <section className="card" aria-label="Alertas del último boletín">
            <h2>Alertas del boletín</h2>
            {d?.alertas?.length > 0 ? (
              <ul className="alerts">{d.alertas.map((a, i) => <li key={i}>{a}</li>)}</ul>
            ) : (
              <p className="kpi-note" style={{ marginTop: 12 }}>{p.cargando && !d ? 'Cargando…' : 'El resumen de este boletín no trae alertas.'}</p>
            )}
          </section>

          <section className="card" aria-label="Estado de los datos">
            <h2 style={{ marginBottom: 6 }}>Estado de los datos</h2>
            <dl>
              <div className="dl-row"><dt>Último boletín procesado</dt><dd>{b ? `SE ${b.semana} · ${b.anio}` : '—'}</dd></div>
              <div className="dl-row"><dt>Fuente</dt><dd>CDC Perú · DGE / MINSA</dd></div>
              <div className="dl-row"><dt>Resúmenes con cifras verificadas</dt><dd>{d ? `${d.estado.conCifras} de ${d.estado.procesados}` : '—'}</dd></div>
            </dl>
          </section>
        </div>
      </div>
    </main>
  )
}
