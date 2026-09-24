'use client'

// Props: value, onChange, onSearch, cargando, sugerencias[]
// Render: input + botón ↑ + chips de sugerencias
// El hint "🔗 contexto" vive en el ensamblador page.js (depende de historial.length)
export default function QueryInput({ value, onChange, onSearch, cargando, sugerencias }) {
  function handleKeyDown(e) {
    if (e.key === 'Enter') onSearch()
  }

  function handleChange(e) {
    onChange(e.target.value)
  }

  return (
    <>
      <div style={styles.queryBox}>
        <input
          style={styles.input}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Escribe tu pregunta..."
          disabled={cargando}
        />
        <button
          style={{ ...styles.sendBtn, opacity: cargando ? 0.6 : 1 }}
          onClick={onSearch}
          aria-label="Enviar consulta"
          disabled={cargando}
        >
          ↑
        </button>
      </div>

      <div style={styles.suggestions}>
        {sugerencias.map((s) => (
          <div key={s} style={styles.chip} onClick={() => onChange(s)}>
            {s}
          </div>
        ))}
      </div>
    </>
  )
}

const styles = {
  queryBox: { background: '#111E2E', border: '1px solid #25405C', borderRadius: 14, padding: 6, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 },
  input: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#EAF2FA', fontSize: 15, padding: '12px 14px', fontFamily: 'inherit' },
  sendBtn: { width: 38, height: 38, borderRadius: 10, background: '#FF6B4A', border: 'none', color: '#2A0F06', fontWeight: 700, cursor: 'pointer', flexShrink: 0 },
  suggestions: { display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' },
  chip: { padding: '7px 14px', border: '1px solid #25405C', borderRadius: 20, fontSize: 12, color: '#9FB4C9', fontFamily: 'monospace', cursor: 'pointer' },
}
