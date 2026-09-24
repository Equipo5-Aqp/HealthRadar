'use client'

import { useHistoricos } from '@/modules/historicos/hooks/useHistoricos'
import FiltrosPanel from '@/modules/historicos/components/FiltrosPanel'
import DataTable    from '@/modules/historicos/components/DataTable'
import { ENFERMEDADES }  from '@/modules/shared/constants/enfermedades'
import { DEPARTAMENTOS } from '@/modules/shared/constants/departamentos'

export default function Page() {
  const h = useHistoricos()
  return (
    <div style={styles.page}>
      <header style={styles.topbar}>
        <div style={styles.brand}>
          <div style={styles.brandMark}>HR</div>
          <div style={styles.brandName}>HealthRadar</div>
          <div style={styles.brandTag}>DATOS HISTÓRICOS</div>
        </div>
        {/* Nav cross-zone: <a> puro (Regla 4) */}
        <a href="/" style={styles.navBtn}>← Volver a la consulta</a>
      </header>

      <main style={styles.main}>
        <div style={styles.head}>
          <div style={styles.title}>Datos históricos</div>
          <div style={styles.sub}>Elige un dataset para ver los registros almacenados en la base de datos</div>
        </div>

        <FiltrosPanel
          tabla={h.tabla} onTablaChange={h.seleccionarTabla}
          departamento={h.departamento} onDepartamentoChange={h.setDepartamento}
          anio={h.anio} onAnioChange={h.setAnio}
          onAplicarFiltros={h.aplicarFiltros} onLimpiarFiltros={h.limpiarFiltros}
          ENFERMEDADES={ENFERMEDADES} DEPARTAMENTOS={DEPARTAMENTOS}
        />

        <DataTable
          filas={h.filas} columnas={h.columnas} pagina={h.pagina}
          cargando={h.cargando} error={h.error} consultado={h.consultado}
          hayFiltros={!!(h.departamento || h.anio)}
          onAnterior={() => h.irAPagina(h.pagina - 1)}
          onSiguiente={() => h.irAPagina(h.pagina + 1)}
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
  main: { padding: '32px 40px', maxWidth: 1100, margin: '0 auto' },
  head: { marginBottom: 20 },
  title: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' },
  sub: { fontSize: 13, color: '#9FB4C9', marginTop: 4 },
}
