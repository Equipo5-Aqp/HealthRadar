import { useState } from 'react'

const MOCK_HISTORY = [
  { id: 1, casos: 30 }, { id: 2, casos: 35 }, { id: 3, casos: 28 },
  { id: 4, casos: 40 }, { id: 5, casos: 38 }, { id: 6, casos: 45 },
  { id: 7, casos: 42 }, { id: 8, casos: 50 }, { id: 9, casos: 55 },
  { id: 10, casos: 78 }, { id: 11, casos: 88 }, { id: 12, casos: 95 },
]

const SUGERENCIAS = [
  'distritos con riesgo alto',
  'comparar Lima Norte vs Lima Sur',
  'correlación lluvia y casos',
]

const RESPUESTA_MOCK = {
  badge: '3 distritos con incremento anómalo',
  texto: [
    'San Martín de Porres y Villa El Salvador muestran un aumento de casos ',
    { strong: 'por encima de lo esperado' },
    ' para esta época del año, coincidiendo con precipitaciones sostenidas en los últimos 7 días. Ate se mantiene en vigilancia con una tendencia moderada al alza.',
  ],
  evidencia: [
    { label: 'Distrito con mayor riesgo', valor: 'SMP', alerta: true },
    { label: 'Variación vs. histórico', valor: '+64%', alerta: true },
    { label: 'Fuente', valor: 'MINSA · SENAMHI', alerta: false },
  ],
}

function App() {
  const [pregunta, setPregunta] = useState('¿Qué distritos tienen más dengue que la semana pasada?')
  const [mostrarRespuesta, setMostrarRespuesta] = useState(true)
  const [cargando, setCargando] = useState(false)

  function consultar() {
    if (!pregunta.trim()) return
    setCargando(true)
    setMostrarRespuesta(false)
    setTimeout(() => {
      setCargando(false)
      setMostrarRespuesta(true)
    }, 700)
  }

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={styles.brand}>
          <div style={styles.brandMark}>HR</div>
          <div style={styles.brandName}>HealthRadar</div>
          <div style={styles.brandTag}>MICROFRONTEND · CONSULTA</div>
        </div>
      </div>

      <div style={styles.main}>
        <div style={styles.head}>
          <div style={styles.title}>Preguntá en lenguaje simple</div>
          <div style={styles.sub}>El sistema busca en el historial y en los datos recién descargados</div>
        </div>

        <div style={styles.queryBox}>
          <input
            style={styles.input}
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && consultar()}
            placeholder="Escribe tu pregunta..."
          />
          <button style={styles.sendBtn} onClick={consultar} aria-label="Enviar consulta">↑</button>
        </div>

        <div style={styles.suggestions}>
          {SUGERENCIAS.map((s) => (
            <div key={s} style={styles.chip} onClick={() => setPregunta(s)}>{s}</div>
          ))}
        </div>

        {cargando && <div style={styles.loading}>Analizando historial epidemiológico...</div>}

        {mostrarRespuesta && !cargando && (
          <div style={styles.answerCard}>
            <div style={styles.answerBadge}>● {RESPUESTA_MOCK.badge}</div>
            <div style={styles.answerText}>
              {RESPUESTA_MOCK.texto.map((t, i) =>
                typeof t === 'string' ? t : <b key={i} style={{ color: '#FF6B4A', fontWeight: 600 }}>{t.strong}</b>
              )}
            </div>
            <div style={styles.evidenceRow}>
              {RESPUESTA_MOCK.evidencia.map((e) => (
                <div key={e.label} style={styles.evidence}>
                  <div style={styles.evidenceLabel}>{e.label}</div>
                  <div style={{ ...styles.evidenceVal, color: e.alerta ? '#FF6B4A' : '#EAF2FA' }}>{e.valor}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={styles.panel}>
          <div style={styles.panelTitle}>Casos semanales · San Martín de Porres · últimas 12 semanas</div>
          <div style={styles.chartArea}>
            {MOCK_HISTORY.map((h) => (
              <div
                key={h.id}
                style={{
                  ...styles.bar,
                  height: `${h.casos}%`,
                  background: h.casos > 70 ? '#FF6B4A' : '#1E3A5F',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', background: '#0B1420', color: '#EAF2FA', fontFamily: 'Inter, sans-serif' },
  topbar: { padding: '18px 40px', borderBottom: '1px solid #1A2C40' },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  brandMark: { width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#FF6B4A,#B8391F)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 },
  brandName: { fontWeight: 600, fontSize: 16, fontFamily: "'Space Grotesk', sans-serif" },
  brandTag: { fontSize: 10, color: '#5E7387', marginLeft: 8, padding: '2px 8px', border: '1px solid #25405C', borderRadius: 20, fontFamily: 'monospace' },
  main: { padding: '32px 40px', maxWidth: 760, margin: '0 auto' },
  head: { marginBottom: 20 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' },
  sub: { fontSize: 13, color: '#9FB4C9', marginTop: 4 },
  queryBox: { background: '#111E2E', border: '1px solid #25405C', borderRadius: 14, padding: 6, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 },
  input: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#EAF2FA', fontSize: 15, padding: '12px 14px', fontFamily: 'inherit' },
  sendBtn: { width: 38, height: 38, borderRadius: 10, background: '#FF6B4A', border: 'none', color: '#2A0F06', fontWeight: 700, cursor: 'pointer', flexShrink: 0 },
  suggestions: { display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' },
  chip: { padding: '7px 14px', border: '1px solid #25405C', borderRadius: 20, fontSize: 12, color: '#9FB4C9', fontFamily: 'monospace', cursor: 'pointer' },
  loading: { fontSize: 13, color: '#9FB4C9', fontFamily: 'monospace', marginBottom: 16 },
  answerCard: { background: '#111E2E', border: '1px solid #1A2C40', borderRadius: 12, padding: 24, marginBottom: 24 },
  answerBadge: { display: 'inline-flex', fontFamily: 'monospace', fontSize: 11, color: '#FF6B4A', background: '#2A180F', padding: '4px 10px', borderRadius: 6, marginBottom: 14 },
  answerText: { fontSize: 15, lineHeight: 1.6, marginBottom: 18 },
  evidenceRow: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 },
  evidence: { background: '#16283C', borderRadius: 8, padding: 14 },
  evidenceLabel: { fontSize: 11, color: '#5E7387', marginBottom: 6 },
  evidenceVal: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600 },
  panel: { background: '#111E2E', border: '1px solid #1A2C40', borderRadius: 12, padding: 20 },
  panelTitle: { fontSize: 14, fontWeight: 600, marginBottom: 16 },
  chartArea: { height: 140, background: '#16283C', borderRadius: 10, display: 'flex', alignItems: 'flex-end', gap: 8, padding: 16 },
  bar: { flex: 1, borderRadius: '3px 3px 0 0', transition: 'height 0.3s' },
}

export default App
