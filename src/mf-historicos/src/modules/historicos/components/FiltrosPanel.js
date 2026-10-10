'use client'

import { FUENTES } from '@/modules/shared/constants/fuentes'
import { DEPARTAMENTOS } from '@/modules/shared/constants/departamentos'

export default function FiltrosPanel({ h }) {
  function enviar(e) {
    e.preventDefault()
    h.aplicarFiltros()
  }
  return (
    <form className="filters" aria-label="Filtros" onSubmit={enviar}>
      <div className="field">
        <span className="lbl" id="t-fuente-l">Fuente de información</span>
        <div className="seg ds" role="group" aria-labelledby="t-fuente-l">
          {FUENTES.map((f) => (
            <button key={f.valor} type="button" aria-pressed={h.tabla === f.valor} onClick={() => h.seleccionarTabla(f.valor)}>
              {f.etiqueta}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="t-dep">Departamento</label>
        <select id="t-dep" className="select fuente" value={h.departamento} onChange={(e) => h.setDepartamento(e.target.value)}>
          {DEPARTAMENTOS.map((d) => <option key={d.codigo} value={d.codigo}>{d.nombre}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="t-anio">Año</label>
        <input
          id="t-anio" className="input" type="text" inputMode="numeric" maxLength={4} autoComplete="off"
          placeholder="Ej. 2024" value={h.anio} aria-invalid={h.errorAnio ? 'true' : undefined}
          aria-describedby={h.errorAnio ? 't-anio-error' : undefined}
          onChange={(e) => h.setAnio(e.target.value.replace(/\D/g, ''))}
        />
      </div>
      <button type="submit" className="btn-primary" disabled={!h.tabla || Boolean(h.errorAnio) || h.cargando}>Filtrar</button>
      <button type="button" className="btn-ghost" onClick={h.limpiarFiltros} disabled={h.cargando || (!h.departamento && !h.anio)}>Limpiar</button>
      {h.errorAnio && <p id="t-anio-error" className="field-error" role="alert">{h.errorAnio}</p>}
    </form>
  )
}
