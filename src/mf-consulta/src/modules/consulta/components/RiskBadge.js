'use client'

import { RIESGO_COLORES, RIESGO_NIVEL_PCT } from '@/modules/shared/constants/riesgo'

// Props: nivel ('alto'|'medio'|'bajo'|null)
// Retorna null si nivel es falsy (page.js:213/225 solo renderizan cuando hay nivel)
export default function RiskBadge({ nivel }) {
  if (!nivel) return null

  return (
    <>
      {/* Badge de nivel (page.js:213-222) */}
      <div
        style={{
          ...styles.riskBadge,
          background: RIESGO_COLORES[nivel]?.bg || '#333',
          color: RIESGO_COLORES[nivel]?.text || '#fff',
        }}
      >
        RIESGO {nivel.toUpperCase()}
      </div>

      {/* Barra de progreso (page.js:225-241) */}
      <div style={styles.riskBarWrap}>
        <div style={styles.riskBarTrack}>
          <div
            style={{
              ...styles.riskBarFill,
              width: `${RIESGO_NIVEL_PCT[nivel] || 0}%`,
              background: RIESGO_COLORES[nivel]?.barra || '#666',
            }}
          />
        </div>
        <div style={styles.riskBarLabels}>
          <span>Bajo</span>
          <span>Medio</span>
          <span>Alto</span>
        </div>
      </div>
    </>
  )
}

const styles = {
  riskBadge: { display: 'inline-flex', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 8, marginBottom: 12 },
  riskBarWrap: { marginBottom: 18 },
  riskBarTrack: { height: 8, background: '#16283C', borderRadius: 6, overflow: 'hidden' },
  riskBarFill: { height: '100%', borderRadius: 6, transition: 'width 0.4s ease' },
  riskBarLabels: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#5E7387', fontFamily: 'monospace', marginTop: 4 },
}
