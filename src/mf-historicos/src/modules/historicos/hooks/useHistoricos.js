'use client'

import { useState } from 'react'
import { cargarHistoricos } from '../infrastructure/n8nHistoricosAdapter'

export function useHistoricos() {
  const [tabla, setTabla] = useState('')
  const [pagina, setPagina] = useState(1)
  const [filas, setFilas] = useState([])
  const [columnas, setColumnas] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [consultado, setConsultado] = useState(false)
  const [departamento, setDepartamento] = useState('')
  const [anio, setAnio] = useState('')

  async function cargarDatos(tablaElegida, paginaElegida, departamentoElegido, anioElegido) {
    setCargando(true)
    setError('')
    try {
      const data = await cargarHistoricos(tablaElegida, paginaElegida, departamentoElegido, anioElegido)
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
    cargarDatos(valor, 1, departamento, anio)
  }

  function irAPagina(nuevaPagina) {
    if (nuevaPagina < 1) return
    setPagina(nuevaPagina)
    cargarDatos(tabla, nuevaPagina, departamento, anio)
  }

  function aplicarFiltros() {
    if (!tabla) return
    setPagina(1)
    cargarDatos(tabla, 1, departamento, anio)
  }

  function limpiarFiltros() {
    setDepartamento('')
    setAnio('')
    if (tabla) {
      setPagina(1)
      cargarDatos(tabla, 1, '', '')
    }
  }

  return {
    tabla, pagina, filas, columnas,
    cargando, error, consultado,
    departamento, setDepartamento,
    anio, setAnio,
    seleccionarTabla, irAPagina,
    aplicarFiltros, limpiarFiltros,
  }
}
