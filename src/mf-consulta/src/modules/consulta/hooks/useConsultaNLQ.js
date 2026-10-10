'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { consultar as consultarAdapter, ErrorConsulta } from '../infrastructure/n8nConsultaAdapter'
import { nuevoSessionId } from '../lib/formato'

// Mensajes del chat: { id, rol:'user'|'bot'|'error', texto, modelo, nivelRiesgo, advertencia, tipoError }
export function useConsultaNLQ() {
  const [pregunta, setPregunta] = useState('')
  const [mensajes, setMensajes] = useState([])
  const [cargando, setCargando] = useState(false)
  const sessionId = useRef(null)
  const contador = useRef(0)
  const enCurso = useRef(false)

  // El id de conversación se crea en el navegador (no en el render del servidor) y se reinicia
  // con "Nueva conversación": el flujo guarda el historial de esa sesión (Postgres + memoria).
  useEffect(() => { sessionId.current = nuevoSessionId() }, [])

  const siguienteId = () => { contador.current += 1; return contador.current }

  const consultar = useCallback(async (texto) => {
    const q = (typeof texto === 'string' ? texto : pregunta).trim()
    if (!q || enCurso.current) return
    enCurso.current = true
    if (!sessionId.current) sessionId.current = nuevoSessionId()
    setMensajes((prev) => [...prev, { id: siguienteId(), rol: 'user', texto: q }])
    setPregunta('')
    setCargando(true)
    try {
      const d = await consultarAdapter(q, sessionId.current)
      setMensajes((prev) => [...prev, {
        id: siguienteId(), rol: 'bot', texto: d.output,
        modelo: d.modelo_usado, nivelRiesgo: d.nivel_riesgo, advertencia: d.advertencia_cifras,
      }])
    } catch (err) {
      const tipo = err instanceof ErrorConsulta ? err.tipo : 'servidor'
      const texto = err instanceof ErrorConsulta
        ? err.message
        : 'La respuesta del servicio no tuvo el formato esperado. Inténtalo de nuevo.'
      setMensajes((prev) => [...prev, { id: siguienteId(), rol: 'error', texto, tipoError: tipo }])
    } finally {
      enCurso.current = false
      setCargando(false)
    }
  }, [pregunta])

  const nuevaConversacion = useCallback(() => {
    if (enCurso.current) return
    sessionId.current = nuevoSessionId()
    setMensajes([])
    setPregunta('')
  }, [])

  return { pregunta, setPregunta, mensajes, cargando, consultar, nuevaConversacion }
}
