import { ETIQUETA_RIESGO } from '../lib/formato'

// Nivel de riesgo evaluado por el flujo. El color nunca va solo: lleva punto y texto.
export default function RiskBadge({ nivel }) {
  if (!ETIQUETA_RIESGO[nivel]) return null
  return <span className={`badge-riesgo sm ${nivel}`}><i aria-hidden="true" />{ETIQUETA_RIESGO[nivel]}</span>
}
