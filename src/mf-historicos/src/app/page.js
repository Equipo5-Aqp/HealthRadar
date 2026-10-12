import TablaView from '@/modules/historicos/components/TablaView'

// Historicos (tabla). Protegido por nginx auth_request (ADR-014): Nginx verifica la sesion
// en /_auth antes de llegar aqui.
export default function Page() {
  return <TablaView />
}
