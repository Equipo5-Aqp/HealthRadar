import { bloquesDeTexto, trozosEnLinea } from '../lib/formato'

function EnLinea({ texto }) {
  return trozosEnLinea(texto).map((t, i) => (t.negrita ? <strong key={i}>{t.texto}</strong> : t.texto))
}

// Respuesta del modelo con párrafos, listas y **negrita**. Se construye con elementos de React
// (nunca con innerHTML): el texto del modelo no puede inyectar HTML.
export default function TextoRespuesta({ texto }) {
  return bloquesDeTexto(texto).map((b, i) => {
    if (b.tipo === 'p') return <span key={i}><EnLinea texto={b.texto} /></span>
    const Lista = b.ordenada ? 'ol' : 'ul'
    return (
      <Lista key={i}>
        {b.items.map((it, j) => <li key={j}><EnLinea texto={it} /></li>)}
      </Lista>
    )
  })
}
