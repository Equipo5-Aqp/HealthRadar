'use client'

import { useEffect, useRef, useState } from 'react'

// Sprint 4 · HU7 — cuenta de 0 (o del valor anterior) hasta `valor` para que la cifra del detalle «llegue» en vez de aparecer de golpe.
// Con «reducir movimiento» activado devuelve el valor final sin animar. Solo es visual: el valor exacto va aparte para el lector de pantalla.
export function useContador(valor, ms = 700) {
  const [actual, setActual] = useState(0)
  const desde = useRef(0)

  useEffect(() => {
    const destino = Number.isFinite(valor) ? valor : 0
    const reducir = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reducir) { desde.current = destino; setActual(destino); return undefined }
    const inicio = desde.current
    const t0 = performance.now()
    let raf = 0
    const paso = (t) => {
      const p = Math.min(1, (t - t0) / ms)
      const e = 1 - Math.pow(1 - p, 3) // desacelera al final
      const v = inicio + (destino - inicio) * e
      desde.current = v
      setActual(v)
      if (p < 1) raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [valor, ms])

  return Math.round(actual)
}
