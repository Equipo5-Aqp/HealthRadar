'use client'

import { useConsultaNLQ } from '@/modules/consulta/hooks/useConsultaNLQ'
import { useTendencia }    from '@/modules/consulta/hooks/useTendencia'
import QueryInput     from '@/modules/consulta/components/QueryInput'
import AnswerCard     from '@/modules/consulta/components/AnswerCard'
import TrendChart     from '@/modules/consulta/components/TrendChart'
import QueryHistorial from '@/modules/consulta/components/QueryHistorial'
import { SUGERENCIAS, ENFERMEDADES } from '@/modules/shared/constants/enfermedades'

export default function Page() {
  const consulta  = useConsultaNLQ()
  const tendencia = useTendencia()

  return (
    <div style={styles.page}>
      <header style={styles.topbar}>
        <div style={styles.brand}>
          <div style={styles.brandMark}>HR</div>
          <div style={styles.brandName}>HealthRadar</div>
          <div style={styles.brandTag}>NEXT.JS · CONSULTA</div>
        </div>
        {/* Nav cross-zone: <a> puro (Regla 4 — nunca <Link> de next/link) */}
        <a href="/historicos" style={styles.navBtn}>Ver datos históricos →</a>
      </header>

      <main style={styles.main}>
        <div style={styles.head}>
          <div style={styles.title}>Preguntá en lenguaje simple</div>
          <div style={styles.sub}>El sistema busca en el historial y en los datos recién descargados</div>
        </div>

        <QueryInput
          value={consulta.pregunta}
          onChange={consulta.setPregunta}
          onSearch={consulta.consultar}
          cargando={consulta.cargando}
          sugerencias={SUGERENCIAS}
        />

        {/* Hint de contexto: depende de historial, NO vive en QueryInput (v7) */}
        {consulta.historial.length >= 1 && (
          <div style={styles.memoryHint}>
            🔗 Esta consulta usa contexto de tu conversación anterior
          </div>
        )}

        {consulta.cargando && (
          <div style={styles.loading}>Analizando historial epidemiológico...</div>
        )}

        <AnswerCard
          mostrar={consulta.mostrarRespuesta}
          cargando={consulta.cargando}
          error={consulta.error}
          respuesta={consulta.respuesta}
          modelo={consulta.modelo}
          nivelRiesgo={consulta.nivelRiesgo}
        />

        {consulta.historial.length > 1 && (
          <QueryHistorial
            historial={consulta.historial}
            abierto={consulta.historialAbierto}
            onToggle={() => consulta.setHistorialAbierto((v) => !v)}
            onSelectPregunta={consulta.setPregunta}
          />
        )}

        <TrendChart
          enfermedadGrafico={tendencia.enfermedadGrafico}
          onEnfermedadChange={tendencia.seleccionarEnfermedad}
          anioGrafico={tendencia.anioGrafico}
          onAnioChange={tendencia.setAnioGrafico}
          onAplicarAnio={tendencia.aplicarAnio}
          onLimpiarAnio={tendencia.limpiarAnio}
          datosGrafico={tendencia.datosGrafico}
          cargandoGrafico={tendencia.cargandoGrafico}
          errorGrafico={tendencia.errorGrafico}
          maxCasos={tendencia.maxCasos}
          ENFERMEDADES={ENFERMEDADES}
        />
      </main>
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', background: '#0B1420', color: '#EAF2FA', fontFamily: 'Inter, sans-serif' },
  topbar: { padding: '18px 40px', borderBottom: '1px solid #1A2C40', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  brand: { display: 'flex', alignItems: 'center', gap: 10 },
  navBtn: { fontSize: 13, color: '#9FB4C9', textDecoration: 'none', padding: '8px 14px', border: '1px solid #25405C', borderRadius: 10, fontFamily: 'monospace' },
  brandMark: { width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#FF6B4A,#B8391F)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#fff' },
  brandName: { fontWeight: 600, fontSize: 16, fontFamily: "'Space Grotesk', sans-serif" },
  brandTag: { fontSize: 10, color: '#5E7387', marginLeft: 8, padding: '2px 8px', border: '1px solid #25405C', borderRadius: 20, fontFamily: 'monospace' },
  main: { padding: '32px 40px', maxWidth: 760, margin: '0 auto' },
  head: { marginBottom: 20 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' },
  sub: { fontSize: 13, color: '#9FB4C9', marginTop: 4 },
  memoryHint: { fontSize: 11, color: '#5E7387', fontFamily: 'monospace', marginBottom: 10 },
  loading: { fontSize: 13, color: '#9FB4C9', fontFamily: 'monospace', marginBottom: 16 },
}
