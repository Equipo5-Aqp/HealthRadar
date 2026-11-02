'use client'

import { useEffect, useState } from 'react'

// Segundos desde que el componente se montó (empieza en 0). Se calcula con la hora real, no sumando
// ticks: si el navegador frena el temporizador en una pestaña en segundo plano, el contador no se atrasa.
export function useSegundosTranscurridos() {
  const [segundos, setSegundos] = useState(0)
  useEffect(() => {
    const inicio = Date.now()
    const id = setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])
  return segundos
}
