import TablaView from '@/modules/historicos/components/TablaView'

// Datos históricos (tabla). La protección por sesión la aplica nginx (auth_request) o el middleware, según ADR-014.
export default function Page() {
  return <TablaView />
}
