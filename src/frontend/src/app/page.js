'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const SUGERENCIAS = [
  'distritos con riesgo alto',
  'comparar Lima Norte vs Lima Sur',
  'correlación lluvia y casos',
]

const RIESGO_COLORES = {
  alto: { bg: '#2A180F', text: '#FF6B4A', barra: '#FF6B4A' },
  medio: { bg: '#2A2410', text: '#FFD24A', barra: '#FFD24A' },
  bajo: { bg: '#0F2A18', text: '#4AFF8F', barra: '#4AFF8F' },
}

const RIESGO_NIVEL_PCT = { bajo: 33, medio: 66, alto: 100 }

// Mismas 4 tablas y mismo campo 'tabla' que ya usa /historicos, para
// reusar el mismo diccionario/convencion en todo el frontend.
const ENFERMEDADES = [
  { valor: 'dengue', etiqueta: 'Dengue' },
  { valor: 'eda', etiqueta: 'EDA' },
  { valor: 'ira_neumonia', etiqueta: 'IRA - Neumonía' },
  { valor: 'ira_no_neumonia', etiqueta: 'IRA - No Neumonía' },
]

export default function Page() {
  const [pregunta, setPregunta] = useState('¿Qué distritos tienen más dengue que la semana pasada?')
  const [mostrarRespuesta, setMostrarRespuesta] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [respuesta, setRespuesta] = useState('')
  const [error, setError] = useState('')
  const [historial, setHistorial] = useState([])
  const [modelo, setModelo] = useState(null)
  const [nivelRiesgo, setNivelRiesgo] = useState(null)
  const [historialAbierto, setHistorialAbierto] = useState(false)

  // --- Estado del gráfico de tendencia (reemplaza a MOCK_HISTORY) ---
  const [enfermedadGrafico, setEnfermedadGrafico] = useState('dengue')
  const [anioGrafico, setAnioGrafico] = useState('')
  const [datosGrafico, setDatosGrafico] = useState([])
  const [cargandoGrafico, setCargandoGrafico] = useState(false)
  const [errorGrafico, setErrorGrafico] = useState('')

  async function cargarTendencia(tablaElegida, anioElegido) {
    setCargandoGrafico(true)
    setErrorGrafico('')
    try {
      const res = await fetch('/api/tendencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tabla: tablaElegida,
          anio: anioElegido || undefined,
        }),
      })

      if (!res.ok) {
        throw new Error(`El servidor respondió con estado ${res.status}`)
      }

      const data = await res.json()
      // total_casos llega como string desde Postgres (COUNT/SUM sobre
      // bigint) - se convierte a numero antes de graficar.
      const normalizado = (Array.isArray(data) ? data : []).map((d) => ({
        periodo: d.periodo,
        total_casos: Number(d.total_casos) || 0,
      }))
      setDatosGrafico(normalizado)
    } catch (err) {
      setErrorGrafico('No se pudo cargar el gráfico. (' + err.message + ')')
      setDatosGrafico([])
    } finally {
      setCargandoGrafico(false)
    }
  }

  // Vista general al cargar la página: Dengue, sin año (agrupado por año 2010-2024)
  useEffect(() => {
    cargarTendencia('dengue', '')
  }, [])

  function seleccionarEnfermedadGrafico(valor) {
    setEnfermedadGrafico(valor)
    cargarTendencia(valor, anioGrafico)
  }

  function aplicarAnioGrafico() {
    cargarTendencia(enfermedadGrafico, anioGrafico)
  }

  function limpiarAnioGrafico() {
    setAnioGrafico('')
    cargarTendencia(enfermedadGrafico, '')
  }

  const maxCasos = datosGrafico.length > 0
    ? Math.max(...datosGrafico.map((d) => d.total_casos), 1)
    : 1

  async function consultar() {
    if (!pregunta.trim()) return
    const preguntaActual = pregunta
    setCargando(true)
    setMostrarRespuesta(false)
    setError('')

    try {
      const res = await fetch('/api/consulta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta: preguntaActual }),
      })

      if (!res.ok) {
        throw new Error(`El servidor respondió con estado ${res.status}`)
      }

      const data = await res.json()
      const textoRespuesta = data.output || 'El sistema no devolvió una respuesta.'
      const modeloUsado = data.modelo_usado || null
      const nivelRiesgoRecibido = data.nivel_riesgo || null
      setRespuesta(textoRespuesta)
      setModelo(modeloUsado)
      setNivelRiesgo(nivelRiesgoRecibido)
      setHistorial((prev) => [
        { id: Date.now(), pregunta: preguntaActual, respuesta: textoRespuesta, esError: false, modelo: modeloUsado, nivelRiesgo: nivelRiesgoRecibido },
        ...prev,
      ])
    } catch (err) {
      const pareceLimiteIA = /rate limit|quota|too many requests|service unavailable|503/i.test(err.message)
      const textoError = pareceLimiteIA
        ? 'Los proveedores de IA no están disponibles en este momento. Intenta de nuevo en unos segundos.'
        : 'No se pudo conectar con n8n. Verifica que el workflow esté activo. (' + err.message + ')'
      setError(textoError)
      setNivelRiesgo(null)
      setHistorial((prev) => [
        { id: Date.now(), pregunta: preguntaActual, respuesta: textoError, esError: true },
        ...prev,
      ])
    } finally {
      setCargando(false)
      setMostrarRespuesta(true)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={styles.brand}>
          <div style={styles.brandMark}>HR</div>
          <div style={styles.brandName}>HealthRadar</div>
          <div style={styles.brandTag}>NEXT.JS · CONSULTA</div>
        </div>
        <Link href="/historicos" style={styles.navBtn}>Ver datos históricos →</Link>
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

        {historial.length >= 1 && (
          <div style={styles.memoryHint}>🔗 Esta consulta usa contexto de tu conversación anterior</div>
        )}

        {cargando && <div style={styles.loading}>Analizando historial epidemiológico...</div>}

        {mostrarRespuesta && !cargando && error && (
          <div style={{ ...styles.answerCard, border: '1px solid #B8391F' }}>
            <div style={{ ...styles.answerBadge, color: '#FF6B4A' }}>● ERROR DE CONEXIÓN</div>
            <div style={styles.answerText}>{error}</div>
          </div>
        )}

        {mostrarRespuesta && !cargando && !error && (
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
            {nivelRiesgo && (
              <div
                style={{
                  ...styles.riskBadge,
                  background: RIESGO_COLORES[nivelRiesgo]?.bg || '#333',
                  color: RIESGO_COLORES[nivelRiesgo]?.text || '#fff',
                }}
              >
                RIESGO {nivelRiesgo.toUpperCase()}
              </div>
            )}

            {nivelRiesgo && (
              <div style={styles.riskBarWrap}>
                <div style={styles.riskBarTrack}>
                  <div
                    style={{
                      ...styles.riskBarFill,
                      width: `${RIESGO_NIVEL_PCT[nivelRiesgo] || 0}%`,
                      background: RIESGO_COLORES[nivelRiesgo]?.barra || '#666',
                    }}
                  />
                </div>
                <div style={styles.riskBarLabels}>
                  <span>Bajo</span>
                  <span>Medio</span>
                  <span>Alto</span>
                </div>
              </div>
            )}

            <div style={styles.answerText}>{respuesta}</div>
          </div>
        )}

        {/* Historial desplegable: colapsado por defecto */}
        {historial.length > 1 && (
          <div style={styles.panel}>
            <div
              style={styles.panelTitleClickable}
              onClick={() => setHistorialAbierto((v) => !v)}
            >
              <span>Historial de esta sesión ({historial.length - 1} anteriores)</span>
              <span style={styles.chevron}>{historialAbierto ? '▲' : '▼'}</span>
            </div>
            {historialAbierto && (
              <div style={styles.historyList}>
                {historial.slice(1).map((h) => (
                  <div key={h.id} style={styles.historyItem} onClick={() => setPregunta(h.pregunta)}>
                    <div style={styles.historyQuestion}>{h.pregunta}</div>
                    <div style={{ ...styles.historyAnswer, color: h.esError ? '#FF6B4A' : '#9FB4C9' }}>
                      {h.respuesta}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Gráfico de tendencia real (Postgres) - reemplaza a MOCK_HISTORY */}
        <div style={styles.panel}>
          <div style={styles.panelTitle}>Tendencia de casos</div>

          <div style={styles.graphSelectorRow}>
            {ENFERMEDADES.map((e) => (
              <button
                key={e.valor}
                style={{
                  ...styles.tabButtonSmall,
                  ...(enfermedadGrafico === e.valor ? styles.tabButtonActive : {}),
                }}
                onClick={() => seleccionarEnfermedadGrafico(e.valor)}
              >
                {e.etiqueta}
              </button>
            ))}
          </div>

          <div style={styles.graphFilterRow}>
            <input
              style={styles.filterInputSmall}
              type="number"
              placeholder="Año (ej. 2020) — vacío = vista general"
              value={anioGrafico}
              onChange={(e) => setAnioGrafico(e.target.value)}
            />
            <button style={styles.filterBtnSmall} onClick={aplicarAnioGrafico}>Filtrar</button>
            {anioGrafico && (
              <button style={styles.filterBtnGhostSmall} onClick={limpiarAnioGrafico}>Limpiar</button>
            )}
          </div>

          <div style={styles.graphSub}>
            {anioGrafico
              ? `Casos por semana epidemiológica — ${anioGrafico}`
              : 'Casos por año — histórico 2010-2024'}
          </div>

          {cargandoGrafico && <div style={styles.loading}>Cargando gráfico...</div>}

          {errorGrafico && !cargandoGrafico && (
            <div style={styles.errorBox}>{errorGrafico}</div>
          )}

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
              <div style={styles.chartLabels}>
                <span>{datosGrafico[0]?.periodo}</span>
                <span>{datosGrafico[datosGrafico.length - 1]?.periodo}</span>
              </div>
            </>
          )}

          {!cargandoGrafico && !errorGrafico && datosGrafico.length === 0 && (
            <div style={styles.placeholder}>No hay datos para mostrar.</div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', background: '#0B1420', color: '#EAF2FA', fontFamily: 'Inter, sans-serif' },
  topbar: { padding: '18px 40px', borderBottom: '1px solid #1A2C40', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  navBtn: { fontSize: 13, color: '#9FB4C9', textDecoration: 'none', padding: '8px 14px', border: '1px solid #25405C', borderRadius: 10, fontFamily: 'monospace' },
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
  memoryHint: { fontSize: 11, color: '#5E7387', fontFamily: 'monospace', marginBottom: 10 },
  answerCard: { background: '#111E2E', border: '1px solid #1A2C40', borderRadius: 12, padding: 24, marginBottom: 24 },
  answerBadge: { display: 'inline-flex', alignItems: 'center', fontFamily: 'monospace', fontSize: 11, color: '#FF6B4A', background: '#2A180F', padding: '4px 10px', borderRadius: 6, marginBottom: 14 },
  modelBadge: { marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 6, color: '#fff' },
  riskBadge: { display: 'inline-flex', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 8, marginBottom: 12 },
  riskBarWrap: { marginBottom: 18 },
  riskBarTrack: { height: 8, background: '#16283C', borderRadius: 6, overflow: 'hidden' },
  riskBarFill: { height: '100%', borderRadius: 6, transition: 'width 0.4s ease' },
  riskBarLabels: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#5E7387', fontFamily: 'monospace', marginTop: 4 },
  answerText: { fontSize: 15, lineHeight: 1.6, marginBottom: 18 },
  evidenceRow: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 },
  evidence: { background: '#16283C', borderRadius: 8, padding: 14 },
  evidenceLabel: { fontSize: 11, color: '#5E7387', marginBottom: 6 },
  evidenceVal: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600 },
  panel: { background: '#111E2E', border: '1px solid #1A2C40', borderRadius: 12, padding: 20, marginBottom: 24 },
  panelTitle: { fontSize: 14, fontWeight: 600, marginBottom: 16 },
  panelTitleClickable: { fontSize: 14, fontWeight: 600, marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' },
  chevron: { fontSize: 11, color: '#5E7387' },
  historyList: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 },
  historyItem: { background: '#16283C', borderRadius: 8, padding: 12, cursor: 'pointer' },
  historyQuestion: { fontSize: 13, color: '#EAF2FA', fontWeight: 600, marginBottom: 4 },
  historyAnswer: { fontSize: 12, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' },
  graphSelectorRow: { display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  tabButtonSmall: {
    padding: '8px 14px', borderRadius: 10, border: '1px solid #25405C', background: '#0B1420',
    color: '#9FB4C9', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
  },
  tabButtonActive: { background: '#FF6B4A', color: '#2A0F06', borderColor: '#FF6B4A', fontWeight: 600 },
  graphFilterRow: { display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' },
  filterInputSmall: { padding: '8px 12px', borderRadius: 10, border: '1px solid #25405C', background: '#0B1420', color: '#EAF2FA', fontSize: 12, fontFamily: 'inherit', flex: 1, minWidth: 200 },
  filterBtnSmall: { padding: '8px 14px', borderRadius: 10, border: 'none', background: '#FF6B4A', color: '#2A0F06', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' },
  filterBtnGhostSmall: { padding: '8px 14px', borderRadius: 10, border: '1px solid #25405C', background: 'transparent', color: '#9FB4C9', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' },
  graphSub: { fontSize: 11, color: '#5E7387', fontFamily: 'monospace', marginBottom: 14 },
  placeholder: { fontSize: 13, color: '#5E7387', fontFamily: 'monospace', padding: '20px 0', textAlign: 'center' },
  errorBox: { background: '#2A180F', border: '1px solid #B8391F', color: '#FF6B4A', borderRadius: 10, padding: 14, fontSize: 12 },
  chartArea: { height: 140, background: '#16283C', borderRadius: 10, display: 'flex', alignItems: 'flex-end', gap: 4, padding: 16 },
  chartLabels: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#5E7387', fontFamily: 'monospace', marginTop: 6 },
  bar: { flex: 1, borderRadius: '3px 3px 0 0', transition: 'height 0.3s', minWidth: 4 },
}