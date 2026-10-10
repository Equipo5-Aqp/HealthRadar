'use client'

import { useEffect, useState } from 'react'
import { cargarTendencia } from '../infrastructure/n8nPanoramaAdapter'
import { ANIO_MAX_CASOS } from '@/modules/shared/constants/enfermedades'

// Gráfico de tendencia. Por defecto: dengue, todo el Perú, último año con casos registrados (semanal).
export function useTendenciaPanorama() {
  const [enfermedad, setEnfermedad] = useState('dengue')
  const [departamento, setDepartamento] = useState('')
  const [anio, setAnio] = useState(String(ANIO_MAX_CASOS)) // '' = una barra por año
  const [datos, setDatos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    setCargando(true)
    setError('')
    cargarTendencia(enfermedad, departamento, anio)
      .then((d) => { if (vivo) setDatos(d) })
      .catch((e) => { if (vivo) { setDatos([]); setError('No se pudo cargar el gráfico. ' + e.message) } })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [enfermedad, departamento, anio])

  return { enfermedad, setEnfermedad, departamento, setDepartamento, anio, setAnio, datos, cargando, error }
}
