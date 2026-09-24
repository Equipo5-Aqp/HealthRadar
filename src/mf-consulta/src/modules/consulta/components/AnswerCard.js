'use client'

import RiskBadge from './RiskBadge'

// Props: mostrar, cargando, error, respuesta, modelo, nivelRiesgo
// Render: tarjeta de error (border #B8391F) O tarjeta de respuesta con badge modelo + RiskBadge
export default function AnswerCard({ mostrar, cargando, error, respuesta, modelo, nivelRiesgo }) {
  if (!mostrar || cargando) return null

  // Rama de error (page.js:191-196)
  if (error) {
    return (
      <div style={{ ...styles.answerCard, border: '1px solid #B8391F' }}>
        <div style={{ ...styles.answerBadge, color: '#FF6B4A' }}>● ERROR DE CONEXIÓN</div>
        <div style={styles.answerText}>{error}</div>
      </div>
    )
  }

  // Rama de respuesta exitosa (page.js:198-246)
  return (
    <div style={styles.answerCard}>
      <div style={styles.answerBadge}>
        ● RESPUESTA DE N8N
        {modelo && (
          <span
            style={{
              ...styles.modelBadge,
              background: modelo === 'claude' ? '#6B4AFF' : '#4A9EFF',
            }}
          >
            {modelo === 'claude' ? 'Claude (respaldo)' : modelo.startsWith('gemini') ? 'Gemini' : modelo}
          </span>
        )}
      </div>

      <RiskBadge nivel={nivelRiesgo} />

      <div style={styles.answerText}>{respuesta}</div>
    </div>
  )
}

const styles = {
  answerCard: { background: '#111E2E', border: '1px solid #1A2C40', borderRadius: 12, padding: 24, marginBottom: 24 },
  answerBadge: { display: 'inline-flex', alignItems: 'center', fontFamily: 'monospace', fontSize: 11, color: '#FF6B4A', background: '#2A180F', padding: '4px 10px', borderRadius: 6, marginBottom: 14 },
  modelBadge: { marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 6, color: '#fff' },
  answerText: { fontSize: 15, lineHeight: 1.6, marginBottom: 18 },
}
