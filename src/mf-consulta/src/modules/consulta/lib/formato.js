// Utilidades de presentación del chat (puras, sin React).

/** Identificador de conversación de 128 bits en hexadecimal (32 caracteres).
 *  crypto.randomUUID() exige contexto seguro (HTTPS): el despliegue actual es HTTP plano,
 *  por eso se usa getRandomValues, que sí funciona sin HTTPS. */
export function nuevoSessionId() {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  const bytes = new Uint8Array(16)
  if (c?.getRandomValues) c.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

const SIGLAS = { glm: 'GLM', gpt: 'GPT' }

/** 'moonshotai/kimi-k3' → 'Kimi K3' · 'z-ai/glm-5.3' → 'GLM 5.3' · 'gemini-3.5-flash-lite' → 'Gemini 3.5 Flash Lite' */
export function etiquetaModelo(modelo) {
  if (typeof modelo !== 'string' || !modelo.trim()) return null
  const base = modelo.trim().replace(/^models\//, '').split('/').pop()
  return base
    .split('-')
    .filter(Boolean)
    .map((t) => {
      const low = t.toLowerCase()
      if (SIGLAS[low]) return SIGLAS[low]
      if (/^[a-z]\d/i.test(t)) return t.toUpperCase()
      if (/^\d/.test(t)) return t
      return t.charAt(0).toUpperCase() + t.slice(1)
    })
    .join(' ')
}

export const ETIQUETA_RIESGO = { alto: 'Riesgo alto', medio: 'Riesgo medio', bajo: 'Riesgo bajo' }

/** Divide la respuesta del modelo en bloques: párrafos y listas (con viñetas o numeradas). */
export function bloquesDeTexto(texto) {
  const bloques = []
  let lista = null
  for (const crudo of String(texto).split(/\r?\n/)) {
    const t = crudo.trim()
    const m = t.match(/^(?:([-*•])|(\d+)[.)])\s+(.+)$/)
    if (m) {
      const ordenada = Boolean(m[2])
      if (!lista || lista.ordenada !== ordenada) {
        lista = { tipo: 'lista', ordenada, items: [] }
        bloques.push(lista)
      }
      lista.items.push(m[3])
    } else {
      lista = null
      if (t) bloques.push({ tipo: 'p', texto: t })
    }
  }
  return bloques
}

/** Parte un texto en trozos { negrita:boolean, texto } según **marcas**. */
export function trozosEnLinea(texto) {
  return String(texto)
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((p) => (p.length > 4 && p.startsWith('**') && p.endsWith('**') ? { negrita: true, texto: p.slice(2, -2) } : { negrita: false, texto: p }))
}
