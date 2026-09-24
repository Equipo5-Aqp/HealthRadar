'use client'

// Props: historial[], abierto, onToggle, onSelectPregunta
// Solo visible cuando historial.length > 1 (el ensamblador controla esa condición)
export default function QueryHistorial({ historial, abierto, onToggle, onSelectPregunta }) {
  return (
    <div style={styles.panel}>
      {/* Header clickable (page.js:251-257) */}
      <div style={styles.panelTitleClickable} onClick={onToggle}>
        <span>Historial de esta sesión ({historial.length - 1} anteriores)</span>
        <span style={styles.chevron}>{abierto ? '▲' : '▼'}</span>
      </div>

      {/* Lista colapsable (page.js:258-270) */}
      {abierto && (
        <div style={styles.historyList}>
          {historial.slice(1).map((h) => (
            <div
              key={h.id}
              style={styles.historyItem}
              onClick={() => onSelectPregunta(h.pregunta)}
            >
              <div style={styles.historyQuestion}>{h.pregunta}</div>
              <div style={{ ...styles.historyAnswer, color: h.esError ? '#FF6B4A' : '#9FB4C9' }}>
                {h.respuesta}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const styles = {
  panel: { background: '#111E2E', border: '1px solid #1A2C40', borderRadius: 12, padding: 20, marginBottom: 24 },
  panelTitleClickable: { fontSize: 14, fontWeight: 600, marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' },
  chevron: { fontSize: 11, color: '#5E7387' },
  historyList: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 },
  historyItem: { background: '#16283C', borderRadius: 8, padding: 12, cursor: 'pointer' },
  historyQuestion: { fontSize: 13, color: '#EAF2FA', fontWeight: 600, marginBottom: 4 },
  historyAnswer: { fontSize: 12, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' },
}
