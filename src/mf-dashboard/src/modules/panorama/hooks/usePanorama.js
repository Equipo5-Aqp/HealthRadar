'use client'

import { useEffect, useState } from 'react'
import { cargarPanorama } from '../infrastructure/n8nPanoramaAdapter'

// Datos del último boletín (o del período elegido): KPIs, alertas y estado de los datos.
export function usePanorama() {
  const [periodo, setPeriodo] = useState('') // 'anio-semana' o '' = el más reciente
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  async function cargar(valor) {
    setCargando(true)
    setError('')
    try {
      const [anio, semana] = valor ? valor.split('-').map(Number) : [undefined, undefined]
      setDatos(await cargarPanorama(anio, semana))
    } catch (err) {
      setError('No se pudo cargar el panorama. ' + err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { cargar('') }, [])

  function elegirPeriodo(valor) {
    setPeriodo(valor)
    cargar(valor)
  }

  return { periodo, elegirPeriodo, datos, cargando, error, reintentar: () => cargar(periodo) }
}
