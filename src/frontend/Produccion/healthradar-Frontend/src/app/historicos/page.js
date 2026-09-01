'use client'

import { useState } from 'react'
import Link from 'next/link'

const TABLAS = [
  { valor: 'dengue', etiqueta: 'Dengue' },
  { valor: 'eda', etiqueta: 'EDA' },
  { valor: 'ira_neumonia', etiqueta: 'IRA - Neumonía' },
  { valor: 'ira_no_neumonia', etiqueta: 'IRA - No Neumonía' },
]

export default function HistoricosPage() {
  const [tabla, setTabla] = useState('')
  const [pagina, setPagina] = useState(1)
  const [filas, setFilas] = useState([])
  const [columnas, setColumnas] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [consultado, setConsultado] = useState(false)

  async function cargarDatos(tablaElegida, paginaElegida) {
    setCargando(true)
    setError('')
    try {
      const res = await fetch('/api/historicos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabla: tablaElegida, pagina: paginaElegida }),
      })

      if (!res.ok) {
        throw new Error(`El servidor respondió con estado ${res.status}`)
      }

      const data = await res.json()
      const arreglo = Array.isArray(data) ? data : [data]

      if (arreglo.length === 0) {
        setFilas([])
        setColumnas([])
      } else {
        setFilas(arreglo)
        setColumnas(Object.keys(arreglo[0]))
      }
      setConsultado(true)
    } catch (err) {
      setError('No se pudo conectar con n8n. Verifica que el workflow esté activo. (' + err.message + ')')
      setFilas([])
      setColumnas([])
      setConsultado(true)
    } finally {
      setCargando(false)
    }
  }

  function seleccionarTabla(valor) {
    setTabla(valor)
    setPagina(1)
    cargarDatos(valor, 1)
  }

  function irAPagina(nuevaPagina) {
    if (nuevaPagina < 1) return
    setPagina(nuevaPagina)
    cargarDatos(tabla, nuevaPagina)
  }

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={styles.brand}>
          <div style={styles.brandMark}>HR</div>
          <div style={styles.brandName}>HealthRadar</div>
          <div style={styles.brandTag}>DATOS HISTÓRICOS</div>
        </div>
        <Link href="/" style={styles.navBtn}>← Volver a la consulta</Link>
      </div>

      <div style={styles.main}>
        <div style={styles.head}>
          <div style={styles.title}>Datos históricos</div>
          <div style={styles.sub}>Elige un dataset para ver los registros almacenados en la base de datos</div>
        </div>

        <div style={styles.selectorRow}>
          {TABLAS.map((t) => (
            <button
              key={t.valor}
              style={{
                ...styles.tabButton,
                ...(tabla === t.valor ? styles.tabButtonActive : {}),
              }}
              onClick={() => seleccionarTabla(t.valor)}
            >
              {t.etiqueta}
            </button>
          ))}
        </div>

        {!consultado && !cargando && (
          <div style={styles.placeholder}>Selecciona un dataset arriba para ver los datos.</div>
        )}

        {cargando && <div style={styles.loading}>Cargando datos...</div>}

        {error && !cargando && <div style={styles.errorBox}>{error}</div>}

        {!cargando && !error && consultado && filas.length === 0 && (
          <div style={styles.placeholder}>No hay más registros para mostrar.</div>
        )}

        {!cargando && !error && filas.length > 0 && (
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
                onClick={() => irAPagina(pagina - 1)}
                disabled={pagina === 1}
              >
                ← Anterior
              </button>
              <div style={styles.pageLabel}>Página {pagina} · {filas.length} registros</div>
              <button
                style={{ ...styles.pageBtn, opacity: filas.length < 100 ? 0.4 : 1 }}
                onClick={() => irAPagina(pagina + 1)}
                disabled={filas.length < 100}
              >
                Siguiente →
              </button>
            </div>
          </>
        )}
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
  main: { padding: '32px 40px', maxWidth: 1100, margin: '0 auto' },
  head: { marginBottom: 20 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' },
  sub: { fontSize: 13, color: '#9FB4C9', marginTop: 4 },
  selectorRow: { display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' },
  tabButton: {
    padding: '10px 18px', borderRadius: 10, border: '1px solid #25405C', background: '#111E2E',
    color: '#9FB4C9', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
  },
  tabButtonActive: { background: '#FF6B4A', color: '#2A0F06', borderColor: '#FF6B4A', fontWeight: 600 },
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