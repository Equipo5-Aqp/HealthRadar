// Estados de progreso de la consulta (HU5). Puro, sin React.
// El texto depende solo de cuántos segundos lleva la espera: el navegador no sabe en qué paso va el
// servidor, así que ningún mensaje afirma un paso interno (no dice "buscando en…", "consultando…").

export const LIMITE_SEGUNDOS = 60 // tiempo máximo de espera del servicio (proxy nginx)

// nivel: 'normal' | 'lento' (tarda más de lo habitual) | 'limite' (cerca o más allá de los 60 s)
const ETAPAS = [
  { desde: 0, nivel: 'normal', mensaje: 'Analizando tu pregunta…' },
  { desde: 10, nivel: 'normal', mensaje: 'Sigo trabajando en tu consulta…' },
  { desde: 25, nivel: 'normal', mensaje: 'Las consultas con muchos datos pueden tardar un poco más…' },
  { desde: 40, nivel: 'lento', mensaje: 'Está tardando más de lo habitual. Sigo esperando la respuesta…' },
  { desde: 55, nivel: 'limite', mensaje: `Se acerca el tiempo máximo de espera (${LIMITE_SEGUNDOS} s). Si no llega, podrás volver a preguntar.` },
  { desde: LIMITE_SEGUNDOS, nivel: 'limite', mensaje: `Se superó el tiempo de espera de ${LIMITE_SEGUNDOS} s. Puede que no llegue respuesta; si aparece un error, vuelve a preguntar.` },
]

/** Etapa que corresponde a los segundos transcurridos: { etapa, mensaje, nivel }. */
export function estadoProgreso(segundos) {
  const s = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos) : 0
  let etapa = 0
  for (let i = 0; i < ETAPAS.length; i++) if (s >= ETAPAS[i].desde) etapa = i
  return { etapa, mensaje: ETAPAS[etapa].mensaje, nivel: ETAPAS[etapa].nivel }
}
