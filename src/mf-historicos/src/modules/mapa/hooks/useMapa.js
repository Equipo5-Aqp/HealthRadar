'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cargarDepartamentos, cargarGeoJson, ErrorMapa } from '../infrastructure/n8nMapaAdapter'
import { construirMapa } from '../lib/proyeccion'
import { crearEscala, rangosPorNivel } from '../lib/escala'
import { ANIO_MAX_CASOS } from '@/modules/shared/constants/fuentes'

export function useMapa() {
  const [tabla, setTabla] = useState('dengue')
  const [anio, setAnio] = useState(String(ANIO_MAX_CASOS)) // '' = acumulado de todos los años
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [geo, setGeo] = useState(null)
  const [errorGeo, setErrorGeo] = useState('')
  const [seleccion, setSeleccion] = useState(null)
  const ultima = useRef(0)

  // Contorno: una vez, desde el navegador.
  useEffect(() => {
    let vivo = true
    cargarGeoJson()
      .then((g) => { if (vivo) setGeo(construirMapa(g)) })
      .catch((e) => { if (vivo) setErrorGeo(e instanceof ErrorMapa ? e.message : 'No se pudo cargar el contorno del mapa.') })
    return () => { vivo = false }
  }, [])

  // Casos: cada vez que cambia la fuente o el año.
  useEffect(() => {
    const id = ++ultima.current
    setCargando(true)
    setError('')
    cargarDepartamentos(tabla, anio)
      .then((d) => { if (id === ultima.current) setDatos(d) })
      .catch((e) => {
        if (id !== ultima.current) return
        setDatos(null)
        setError(e instanceof ErrorMapa ? e.message : 'El servicio devolvió datos con un formato inesperado.')
      })
      .finally(() => { if (id === ultima.current) setCargando(false) })
  }, [tabla, anio])

  const calculo = useMemo(() => {
    if (!datos) return null
    const valores = datos.map((d) => d.total)
    const escala = crearEscala(valores)
    const totalNacional = valores.reduce((a, b) => a + b, 0)
    const ordenados = [...datos].sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'))
    const puesto = new Map(ordenados.map((d, i) => [d.codigo, i + 1]))
    const porCodigo = new Map(datos.map((d) => [d.codigo, d]))
    return { escala, totalNacional, ordenados, puesto, porCodigo, rangos: rangosPorNivel(valores, escala) }
  }, [datos])

  return { tabla, setTabla, anio, setAnio, datos, cargando, error, geo, errorGeo, seleccion, setSeleccion, calculo }
}
