'use client'

import { useState } from 'react'
import { iniciarSesion } from '../infrastructure/authAdapter'
import { rutaSegura } from '../infrastructure/rutaSegura'

export function useLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  async function enviar(evento) {
    evento?.preventDefault()
    if (cargando) return
    if (!email.trim() || !password) {
      setError('Escribe tu correo y tu contraseña.')
      return
    }
    setCargando(true)
    setError('')
    const r = await iniciarSesion(email.trim(), password)
    if (r.ok) {
      // Navegación cross-zone: recarga completa con location (Regla 4 — nunca next/link).
      const next = new URLSearchParams(window.location.search).get('next')
      window.location.assign(rutaSegura(next))
      return // se deja "cargando" hasta que cambie la página
    }
    setPassword('') // nunca se deja la contraseña escrita tras un fallo
    setError(r.mensaje)
    setCargando(false)
  }

  return { email, setEmail, password, setPassword, cargando, error, enviar }
}
