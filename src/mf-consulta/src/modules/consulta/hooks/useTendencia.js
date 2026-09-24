'use client'

import { useState, useEffect } from 'react'
import { cargarTendencia as cargarTendenciaAdapter } from '../infrastructure/n8nConsultaAdapter'

export function useTendencia() {
  const [enfermedadGrafico, setEnfermedadGrafico] = useState('dengue')
  const [anioGrafico, setAnioGrafico] = useState('')
  const [datosGrafico, setDatosGrafico] = useState([])
  const [cargandoGrafico, setCargandoGrafico] = useState(false)
  const [errorGrafico, setErrorGrafico] = useState('')

  async function cargarTendencia(tablaElegida, anioElegido) {
    setCargandoGrafico(true)
    setErrorGrafico('')
    try {
      const normalizado = await cargarTendenciaAdapter(tablaElegida, anioElegido)
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

  function seleccionarEnfermedad(valor) {
    setEnfermedadGrafico(valor)
    cargarTendencia(valor, anioGrafico)
  }

  function aplicarAnio() {
    cargarTendencia(enfermedadGrafico, anioGrafico)
  }

  function limpiarAnio() {
    setAnioGrafico('')
    cargarTendencia(enfermedadGrafico, '')
  }

  // maxCasos calculado en el hook (no en el componente)
  const maxCasos = datosGrafico.length > 0
    ? Math.max(...datosGrafico.map((d) => d.total_casos), 1)
    : 1

  return {
    enfermedadGrafico,
    anioGrafico, setAnioGrafico,
    datosGrafico, cargandoGrafico, errorGrafico, maxCasos,
    seleccionarEnfermedad, aplicarAnio, limpiarAnio,
  }
}
