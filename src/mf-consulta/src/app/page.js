import ConsultaView from '@/modules/consulta/components/ConsultaView'

// Consulta (chat NLQ). Protegido por nginx auth_request (ADR-014): Nginx verifica la sesion
// en /_auth antes de llegar aqui.
export default function Page() {
  return <ConsultaView />
}
