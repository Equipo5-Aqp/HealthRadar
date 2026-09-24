'use client'

// Props: filas[], columnas[], pagina,
//        cargando, error, consultado, hayFiltros,
//        onAnterior, onSiguiente
// Render con 4 estados de placeholder distintos (page.js:180-237)
export default function DataTable({
  filas, columnas, pagina,
  cargando, error, consultado, hayFiltros,
  onAnterior, onSiguiente,
}) {
  // Estado inicial: sin consulta
  if (!consultado && !cargando) {
    return (
      <div style={styles.placeholder}>
        Selecciona un dataset arriba para ver los datos.
      </div>
    )
  }

  // Cargando
  if (cargando) {
    return <div style={styles.loading}>Cargando datos...</div>
  }

  // Error
  if (error) {
    return <div style={styles.errorBox}>{error}</div>
  }

  // Sin resultados (con o sin filtros activos)
  if (consultado && filas.length === 0) {
    return (
      <div style={styles.placeholder}>
        {hayFiltros
          ? 'No se encontraron registros para el departamento y/o año seleccionados.'
          : 'No hay más registros para mostrar.'}
      </div>
    )
  }

  // Tabla con datos + paginación
  return (
    <>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {columnas.map((col) => (
                <th key={col} style={styles.th}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, i) => (
              <tr key={i} style={styles.tr}>
                {columnas.map((col) => (
                  <td key={col} style={styles.td}>{String(fila[col])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={styles.pagination}>
        <button
          style={{ ...styles.pageBtn, opacity: pagina === 1 ? 0.4 : 1 }}
          onClick={onAnterior}
          disabled={pagina === 1}
        >
          ← Anterior
        </button>
        <div style={styles.pageLabel}>Página {pagina} · {filas.length} registros</div>
        <button
          style={{ ...styles.pageBtn, opacity: filas.length < 100 ? 0.4 : 1 }}
          onClick={onSiguiente}
          disabled={filas.length < 100}
        >
          Siguiente →
        </button>
      </div>
    </>
  )
}

const styles = {
  placeholder: { fontSize: 13, color: '#5E7387', fontFamily: 'monospace', padding: '40px 0', textAlign: 'center' },
  loading: { fontSize: 13, color: '#9FB4C9', fontFamily: 'monospace', marginBottom: 16 },
  errorBox: { background: '#2A180F', border: '1px solid #B8391F', color: '#FF6B4A', borderRadius: 10, padding: 16, fontSize: 13 },
  tableWrap: { overflowX: 'auto', border: '1px solid #1A2C40', borderRadius: 12, background: '#111E2E' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'monospace' },
  th: { textAlign: 'left', padding: '10px 14px', background: '#16283C', color: '#9FB4C9', borderBottom: '1px solid #1A2C40', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid #16283C' },
  td: { padding: '10px 14px', color: '#EAF2FA', whiteSpace: 'nowrap' },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 20 },
  pageBtn: { padding: '10px 18px', borderRadius: 10, border: '1px solid #25405C', background: '#111E2E', color: '#EAF2FA', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' },
  pageLabel: { fontSize: 12, color: '#9FB4C9', fontFamily: 'monospace' },
}
