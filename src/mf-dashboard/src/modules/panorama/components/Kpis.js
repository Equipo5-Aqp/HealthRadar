import { formatoNumero } from '@/modules/shared/formato'

const NOTA_SIN_CIFRAS = 'Cifras no disponibles para este boletín'

// Una tarjeta por indicador. `cifras` solo trae las claves que se pudieron leer y validar.
export default function Kpis({ cifras, riesgo }) {
  const c = cifras || {}
  const items = [
    {
      id: 'dengue', etiqueta: 'Dengue · casos acumulados', valor: c.dengue_total,
      nota: c.dengue_defunciones != null ? `${formatoNumero(c.dengue_defunciones)} defunciones registradas` : null,
    },
    {
      id: 'ira', etiqueta: 'IRA · episodios acumulados', valor: c.ira_total,
      nota: c.ira_neumonias != null ? `${formatoNumero(c.ira_neumonias)} corresponden a neumonías` : null,
    },
    {
      id: 'eda', etiqueta: 'EDA · episodios acumulados', valor: c.eda_total,
      nota: c.eda_disentericas != null ? `${formatoNumero(c.eda_disentericas)} son diarreas disentéricas` : null,
    },
  ]

  return (
    <section className="kpis" aria-label="Indicadores del boletín">
      {items.map((k) => (
        <article className="kpi" key={k.id}>
          <span className="kpi-label">{k.etiqueta}</span>
          <span className={`kpi-value${k.valor == null ? ' vacio' : ''}`}>{formatoNumero(k.valor)}</span>
          <span className="kpi-note">{k.valor == null ? NOTA_SIN_CIFRAS : (k.nota || ' ')}</span>
        </article>
      ))}
      <article className="kpi">
        <span className="kpi-label">Nivel de riesgo</span>
        {riesgo ? (
          <>
            <span className={`badge-riesgo ${riesgo.nivel}`}><i />{riesgo.nivel[0].toUpperCase() + riesgo.nivel.slice(1)}</span>
            <span className="kpi-note">{riesgo.detalle}</span>
          </>
        ) : (
          <>
            <span className="kpi-value vacio">—</span>
            <span className="kpi-note">Aún no disponible en el panorama; el chat sí lo calcula por consulta</span>
          </>
        )}
      </article>
    </section>
  )
}
