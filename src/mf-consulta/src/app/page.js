import ConsultaView from '@/modules/consulta/components/ConsultaView'

// Consulta (chat NLQ). La protección por sesión la aplica nginx (auth_request) o el middleware, según ADR-014.
export default function Page() {
  return <ConsultaView />
}
