'use client'

import { useEffect, useState } from 'react'

const OPCIONES = [
  { valor: 'auto', etiqueta: 'Auto' },
  { valor: 'light', etiqueta: 'Claro' },
  { valor: 'dark', etiqueta: 'Oscuro' },
]

function leerTema() {
  try {
    const t = localStorage.getItem('hr-tema')
    return t === 'light' || t === 'dark' ? t : 'auto'
  } catch {
    return 'auto'
  }
}

export default function ThemeToggle() {
  const [tema, setTema] = useState('auto')

  useEffect(() => { setTema(leerTema()) }, [])

  function elegir(valor) {
    setTema(valor)
    const raiz = document.documentElement
    if (valor === 'auto') raiz.removeAttribute('data-theme')
    else raiz.setAttribute('data-theme', valor)
    try {
      if (valor === 'auto') localStorage.removeItem('hr-tema')
      else localStorage.setItem('hr-tema', valor)
    } catch { /* sin almacenamiento: el tema vale solo en esta visita */ }
  }

  return (
    <div>
      <div className="theme-label" id="hr-tema-etiqueta">Tema</div>
      <div className="seg" role="group" aria-labelledby="hr-tema-etiqueta">
        {OPCIONES.map((o) => (
          <button key={o.valor} type="button" aria-pressed={tema === o.valor} onClick={() => elegir(o.valor)}>
            {o.etiqueta}
          </button>
        ))}
      </div>
    </div>
  )
}
