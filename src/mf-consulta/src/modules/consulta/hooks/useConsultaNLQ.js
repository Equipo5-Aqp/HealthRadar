'use client'

import { useState, useEffect } from 'react'
import { consultar as consultarAdapter, cargarTendencia as cargarTendenciaAdapter } from '../infrastructure/n8nConsultaAdapter'

export function useConsultaNLQ() {
  const [pregunta, setPregunta] = useState('¿Qué distritos tienen más dengue que la semana pasada?')
  const [mostrarRespuesta, setMostrarRespuesta] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [respuesta, setRespuesta] = useState('')
  const [error, setError] = useState('')
  const [historial, setHistorial] = useState([])
  const [modelo, setModelo] = useState(null)
  const [nivelRiesgo, setNivelRiesgo] = useState(null)
  const [historialAbierto, setHistorialAbierto] = useState(false)

  async function consultar() {
    if (!pregunta.trim()) return
    const preguntaActual = pregunta
    setCargando(true)
    setMostrarRespuesta(false)
    setError('')

    try {
      const data = await consultarAdapter(preguntaActual)
      const textoRespuesta = data.output || 'El sistema no devolvió una respuesta.'
      const modeloUsado = data.modelo_usado || null
      const nivelRiesgoRecibido = data.nivel_riesgo || null
      setRespuesta(textoRespuesta)
      setModelo(modeloUsado)
      setNivelRiesgo(nivelRiesgoRecibido)
      setHistorial((prev) => [
        { id: Date.now(), pregunta: preguntaActual, respuesta: textoRespuesta, esError: false, modelo: modeloUsado, nivelRiesgo: nivelRiesgoRecibido },
        ...prev,
      ])
    } catch (err) {
      const pareceLimiteIA = /rate limit|quota|too many requests|service unavailable|503/i.test(err.message)
      const textoError = pareceLimiteIA
        ? 'Los proveedores de IA no están disponibles en este momento. Intenta de nuevo en unos segundos.'
        : 'No se pudo conectar con n8n. Verifica que el workflow esté activo. (' + err.message + ')'
      setError(textoError)
      setNivelRiesgo(null)
      setHistorial((prev) => [
        { id: Date.now(), pregunta: preguntaActual, respuesta: textoError, esError: true },
        ...prev,
      ])
    } finally {
      setCargando(false)
      setMostrarRespuesta(true)
    }
  }

  return {
    pregunta, setPregunta,
    cargando, mostrarRespuesta,
    respuesta, error,
    historial, modelo, nivelRiesgo,
    historialAbierto, setHistorialAbierto,
    consultar,
  }
}
