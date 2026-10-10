'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cargarHistoricos, ErrorHistoricos } from '../infrastructure/n8nHistoricosAdapter'
import { FUENTES, ANIO_MIN_CASOS } from '@/modules/shared/constants/fuentes'
import { DEPARTAMENTOS } from '@/modules/shared/constants/departamentos'

export const POR_PAGINA = 100
const ANIO_TOPE = 2100 // mismo límite que valida el core

// '' = sin filtro. Devuelve un mensaje si el año escrito no sirve.
function errorDeAnio(anio) {
  if (anio === '') return ''
  if (!/^\d{4}$/.test(anio) || Number(anio) < ANIO_MIN_CASOS || Number(anio) > ANIO_TOPE)
    return `Escribe un año entre ${ANIO_MIN_CASOS} y 2100, o déjalo vacío.`
  return ''
}

export function useHistoricos() {
  const [tabla, setTabla] = useState('')
  const [departamento, setDepartamento] = useState('')
  const [anio, setAnio] = useState('')
  const [pagina, setPagina] = useState(1)
  const [filas, setFilas] = useState([])
  const [columnas, setColumnas] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null) // { tipo, mensaje }
  const [consultado, setConsultado] = useState(false)
  const [aplicado, setAplicado] = useState({ tabla: '', departamento: '', anio: '' })
  const ultima = useRef(0)

  const errorAnio = errorDeAnio(anio)

  const cargar = useCallback(async (t, p, d, a) => {
    const id = ++ultima.current // descarta respuestas viejas si el usuario cambió de filtro mientras tanto
    setCargando(true)
    setError(null)
    setAplicado({ tabla: t, departamento: d, anio: a })
    try {
      const data = await cargarHistoricos(t, p, d, a)
      if (id !== ultima.current) return
      setFilas(data)
      setColumnas(data.length ? Object.keys(data[0]) : [])
    } catch (err) {
      if (id !== ultima.current) return
      setError({
        tipo: err instanceof ErrorHistoricos ? err.tipo : 'servidor',
        mensaje: err instanceof ErrorHistoricos ? err.message : 'El servicio devolvió datos con un formato inesperado.',
      })
      setFilas([])
      setColumnas([])
    } finally {
      if (id === ultima.current) { setConsultado(true); setCargando(false) }
    }
  }, [])

  // Llegada desde el mapa: /historicos?tabla=dengue&departamento=20&anio=2024
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const t = q.get('tabla') || ''
    if (!FUENTES.some((f) => f.valor === t)) return
    const d = q.get('departamento') || ''
    const a = q.get('anio') || ''
    const dep = DEPARTAMENTOS.some((x) => x.codigo === d) ? d : ''
    const anioOk = errorDeAnio(a) ? '' : a
    setTabla(t); setDepartamento(dep); setAnio(anioOk)
    cargar(t, 1, dep, anioOk)
  }, [cargar])

  function seleccionarTabla(valor) {
    if (errorAnio) return
    setTabla(valor)
    setPagina(1)
    cargar(valor, 1, departamento, anio)
  }

  function irAPagina(n) {
    if (n < 1 || !tabla) return
    setPagina(n)
    cargar(aplicado.tabla, n, aplicado.departamento, aplicado.anio)
  }

  function aplicarFiltros() {
    if (!tabla || errorAnio) return
    setPagina(1)
    cargar(tabla, 1, departamento, anio)
  }

  function limpiarFiltros() {
    setDepartamento('')
    setAnio('')
    if (tabla) { setPagina(1); cargar(tabla, 1, '', '') }
  }

  return {
    tabla, departamento, setDepartamento, anio, setAnio, errorAnio,
    pagina, filas, columnas, cargando, error, consultado, aplicado,
    seleccionarTabla, irAPagina, aplicarFiltros, limpiarFiltros,
  }
}
