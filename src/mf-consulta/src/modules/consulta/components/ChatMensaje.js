import TextoRespuesta from './TextoRespuesta'
import RiskBadge from './RiskBadge'
import { etiquetaModelo } from '../lib/formato'

const TITULO_ERROR = {
  ia: 'Los modelos de IA no están disponibles',
  conexion: 'Sin conexión con el servidor',
  servidor: 'El servicio no respondió',
}

export default function ChatMensaje({ m }) {
  if (m.rol === 'user') return <div className="msg-user" id={`msg-${m.id}`}>{m.texto}</div>

  if (m.rol === 'error') {
    return (
      <div className="msg-bot error" id={`msg-${m.id}`} role="alert">
        <strong>{TITULO_ERROR[m.tipoError] || TITULO_ERROR.servidor}</strong>
        <span>{m.texto}</span>
      </div>
    )
  }

  const modelo = etiquetaModelo(m.modelo)
  return (
    <div className="msg-bot" id={`msg-${m.id}`}>
      {m.nivelRiesgo && <RiskBadge nivel={m.nivelRiesgo} />}
      <TextoRespuesta texto={m.texto} />
      {m.advertencia && <div className="aviso" role="note">{m.advertencia}</div>}
      {modelo && <div className="msg-meta"><span>Modelo: {modelo}</span></div>}
    </div>
  )
}
