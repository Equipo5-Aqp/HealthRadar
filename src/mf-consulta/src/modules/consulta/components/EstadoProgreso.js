'use client'

import { useSegundosTranscurridos } from '../hooks/useSegundosTranscurridos'
import { estadoProgreso } from '../lib/progreso'

// Indicador mientras se espera la respuesta. Se monta al empezar la consulta y se desmonta al terminar,
// por eso el contador siempre arranca en 0. El lector de pantalla solo oye el mensaje (cambia pocas veces);
// el contador va oculto para no anunciar cada segundo.
export default function EstadoProgreso() {
  const segundos = useSegundosTranscurridos()
  const { etapa, mensaje, nivel } = estadoProgreso(segundos)
  return (
    <div className={`msg-bot escribiendo${nivel === 'normal' ? '' : ` ${nivel}`}`} role="status">
      <span className="puntos" aria-hidden="true"><i /><i /><i /></span>
      <span key={etapa} className="progreso-txt">{mensaje}</span>
      <span className="progreso-seg" aria-hidden="true">{segundos} s</span>
    </div>
  )
}
