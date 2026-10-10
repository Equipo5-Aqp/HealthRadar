'use client'

import { useEffect, useState } from 'react'
import { cerrarSesion, obtenerUsuario } from '../infrastructure/authAdapter'

// Usuario conectado + "Cerrar sesión" (parte inferior de la barra lateral).
export default function UserBox() {
  const [usuario, setUsuario] = useState(null)
  const [saliendo, setSaliendo] = useState(false)

  useEffect(() => {
    let vivo = true
    obtenerUsuario().then((u) => { if (vivo) setUsuario(u) })
    return () => { vivo = false }
  }, [])

  async function salir() {
    if (saliendo) return
    setSaliendo(true)
    await cerrarSesion()
    window.location.assign('/login') // recarga completa (Regla 4)
  }

  const inicial = usuario?.email ? usuario.email[0] : 'A'
  return (
    <div>
      <div className="user">
        <div className="avatar" aria-hidden="true">{inicial}</div>
        <div className="user-text">
          <span className="user-name">{usuario?.email || 'Analista'}</span>
          <span className="user-sub">{usuario?.rol ? `Rol: ${usuario.rol}` : 'Sesión iniciada'}</span>
        </div>
      </div>
      <button type="button" className="logout" onClick={salir} disabled={saliendo}>
        {saliendo ? 'Saliendo…' : 'Cerrar sesión'}
      </button>
    </div>
  )
}
