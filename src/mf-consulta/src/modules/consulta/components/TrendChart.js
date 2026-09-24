'use client'

// Props (TODAS obligatorias — verificadas contra page.js:274-343):
//   enfermedadGrafico, onEnfermedadChange — tabs de enfermedad
//   anioGrafico, onAnioChange             — input de año
//   onAplicarAnio, onLimpiarAnio          — botones Filtrar/Limpiar
//   datosGrafico[], cargandoGrafico, errorGrafico, maxCasos
//   ENFERMEDADES[]                         — recibida del ensamblador
export default function TrendChart({
  enfermedadGrafico, onEnfermedadChange,
  anioGrafico, onAnioChange,
  onAplicarAnio, onLimpiarAnio,
  datosGrafico, cargandoGrafico, errorGrafico, maxCasos,
  ENFERMEDADES,
}) {
  return (
    <div style={styles.panel}>
      <div style={styles.panelTitle}>Tendencia de casos</div>

      {/* Tabs de enfermedad (page.js:277-290) */}
      <div style={styles.graphSelectorRow}>
        {ENFERMEDADES.map((e) => (
          <button
            key={e.valor}
            style={{
              ...styles.tabButtonSmall,
              ...(enfermedadGrafico === e.valor ? styles.tabButtonActive : {}),
            }}
            onClick={() => onEnfermedadChange(e.valor)}
          >
            {e.etiqueta}
          </button>
        ))}
      </div>

      {/* Input año + Filtrar + Limpiar (page.js:292-303) */}
      <div style={styles.graphFilterRow}>
        <input
          style={styles.filterInputSmall}
          type="number"
          placeholder="Año (ej. 2020) — vacío = vista general"
          value={anioGrafico}
          onChange={(e) => onAnioChange(e.target.value)}
        />
        <button style={styles.filterBtnSmall} onClick={onAplicarAnio}>Filtrar</button>
        {anioGrafico && (
          <button style={styles.filterBtnGhostSmall} onClick={onLimpiarAnio}>Limpiar</button>
        )}
      </div>

      {/* Subtítulo dinámico (page.js:306-310) */}
      <div style={styles.graphSub}>
        {anioGrafico
          ? `Casos por semana epidemiológica — ${anioGrafico}`
          : 'Casos por año — histórico 2010-2024'}
      </div>

      {/* Estados */}
      {cargandoGrafico && <div style={styles.loading}>Cargando gráfico...</div>}

      {errorGrafico && !cargandoGrafico && (
        <div style={styles.errorBox}>{errorGrafico}</div>
      )}

      {/* Gráfico de barras (page.js:318-338) */}
      {!cargandoGrafico && !errorGrafico && datosGrafico.length > 0 && (
        <>
          <div style={styles.chartArea}>
            {datosGrafico.map((d) => (
              <div
                key={d.periodo}
                style={{
                  ...styles.bar,
                  height: `${Math.max((d.total_casos / maxCasos) * 100, 2)}%`,
                  background: d.total_casos / maxCasos > 0.7 ? '#FF6B4A' : '#1E3A5F',
                }}
                title={`${d.periodo}: ${d.total_casos} casos`}
              />
            ))}
          </div>
          {/* Labels primer/último período (page.js:333-336) */}
          <div style={styles.chartLabels}>
            <span>{datosGrafico[0]?.periodo}</span>
            <span>{datosGrafico[datosGrafico.length - 1]?.periodo}</span>
          </div>
        </>
      )}

      {/* Placeholder vacío (page.js:340-342) */}
      {!cargandoGrafico && !errorGrafico && datosGrafico.length === 0 && (
        <div style={styles.placeholder}>No hay datos para mostrar.</div>
      )}
    </div>
  )
}

const styles = {
  panel: { background: '#111E2E', border: '1px solid #1A2C40', borderRadius: 12, padding: 20, marginBottom: 24 },
  panelTitle: { fontSize: 14, fontWeight: 600, marginBottom: 16 },
  graphSelectorRow: { display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  tabButtonSmall: { padding: '8px 14px', borderRadius: 10, border: '1px solid #25405C', background: '#0B1420', color: '#9FB4C9', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' },
  tabButtonActive: { background: '#FF6B4A', color: '#2A0F06', borderColor: '#FF6B4A', fontWeight: 600 },
  graphFilterRow: { display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' },
  filterInputSmall: { padding: '8px 12px', borderRadius: 10, border: '1px solid #25405C', background: '#0B1420', color: '#EAF2FA', fontSize: 12, fontFamily: 'inherit', flex: 1, minWidth: 200 },
  filterBtnSmall: { padding: '8px 14px', borderRadius: 10, border: 'none', background: '#FF6B4A', color: '#2A0F06', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' },
  filterBtnGhostSmall: { padding: '8px 14px', borderRadius: 10, border: '1px solid #25405C', background: 'transparent', color: '#9FB4C9', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' },
  graphSub: { fontSize: 11, color: '#5E7387', fontFamily: 'monospace', marginBottom: 14 },
  loading: { fontSize: 13, color: '#9FB4C9', fontFamily: 'monospace', marginBottom: 16 },
  errorBox: { background: '#2A180F', border: '1px solid #B8391F', color: '#FF6B4A', borderRadius: 10, padding: 14, fontSize: 12 },
  chartArea: { height: 140, background: '#16283C', borderRadius: 10, display: 'flex', alignItems: 'flex-end', gap: 4, padding: 16 },
  chartLabels: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#5E7387', fontFamily: 'monospace', marginTop: 6 },
  bar: { flex: 1, borderRadius: '3px 3px 0 0', transition: 'height 0.3s', minWidth: 4 },
  placeholder: { fontSize: 13, color: '#5E7387', fontFamily: 'monospace', padding: '20px 0', textAlign: 'center' },
}
