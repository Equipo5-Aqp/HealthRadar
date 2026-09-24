'use client'

// Props: tabla, onTablaChange, departamento, onDepartamentoChange,
//        anio, onAnioChange, onAplicarFiltros, onLimpiarFiltros,
//        ENFERMEDADES[], DEPARTAMENTOS[]
export default function FiltrosPanel({
  tabla, onTablaChange,
  departamento, onDepartamentoChange,
  anio, onAnioChange,
  onAplicarFiltros, onLimpiarFiltros,
  ENFERMEDADES, DEPARTAMENTOS,
}) {
  return (
    <>
      {/* Tabs de dataset (historicos/page.js:140-153) */}
      <div style={styles.selectorRow}>
        {ENFERMEDADES.map((t) => (
          <button
            key={t.valor}
            style={{
              ...styles.tabButton,
              ...(tabla === t.valor ? styles.tabButtonActive : {}),
            }}
            onClick={() => onTablaChange(t.valor)}
          >
            {t.etiqueta}
          </button>
        ))}
      </div>

      {/* Fila de filtros — SOLO cuando hay tabla seleccionada (page.js:155-178) */}
      {tabla && (
        <div style={styles.filterRow}>
          <select
            style={styles.filterSelect}
            value={departamento}
            onChange={(e) => onDepartamentoChange(e.target.value)}
          >
            {DEPARTAMENTOS.map((d) => (
              <option key={d.codigo} value={d.codigo}>{d.nombre}</option>
            ))}
          </select>

          <input
            style={styles.filterInput}
            type="number"
            placeholder="Año (ej. 2020)"
            value={anio}
            onChange={(e) => onAnioChange(e.target.value)}
          />

          <button style={styles.filterBtn} onClick={onAplicarFiltros}>Filtrar</button>
          <button style={styles.filterBtnGhost} onClick={onLimpiarFiltros}>Limpiar</button>
        </div>
      )}
    </>
  )
}

const styles = {
  selectorRow: { display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' },
  tabButton: { padding: '10px 18px', borderRadius: 10, border: '1px solid #25405C', background: '#111E2E', color: '#9FB4C9', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' },
  tabButtonActive: { background: '#FF6B4A', color: '#2A0F06', borderColor: '#FF6B4A', fontWeight: 600 },
  filterRow: { display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' },
  filterSelect: { padding: '10px 14px', borderRadius: 10, border: '1px solid #25405C', background: '#111E2E', color: '#EAF2FA', fontSize: 13, fontFamily: 'inherit', minWidth: 200 },
  filterInput: { padding: '10px 14px', borderRadius: 10, border: '1px solid #25405C', background: '#111E2E', color: '#EAF2FA', fontSize: 13, fontFamily: 'inherit', width: 140 },
  filterBtn: { padding: '10px 18px', borderRadius: 10, border: 'none', background: '#FF6B4A', color: '#2A0F06', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' },
  filterBtnGhost: { padding: '10px 18px', borderRadius: 10, border: '1px solid #25405C', background: 'transparent', color: '#9FB4C9', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' },
}
