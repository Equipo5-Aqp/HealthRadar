'use client'

import Sidebar from '@/modules/shared/components/Sidebar'
import { useHistoricos } from '../hooks/useHistoricos'
import FiltrosPanel from './FiltrosPanel'
import TablaDatos from './TablaDatos'

export default function TablaView() {
  const h = useHistoricos()
  return (
    <div className="app">
      <Sidebar actual="tabla" />
      <main className="main">
        <header className="page-head block">
          <h1>Datos históricos</h1>
          <p>Registros almacenados en la base de datos. Elige una fuente y filtra por departamento y año.</p>
        </header>
        <FiltrosPanel h={h} />
        <TablaDatos h={h} />
        <p className="note-small">Cada página trae hasta 100 registros; «Siguiente» se desactiva cuando llegan menos de 100.</p>
      </main>
    </div>
  )
}
