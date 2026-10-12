import Sidebar from '@/modules/shared/components/Sidebar'
import PanoramaView from '@/modules/panorama/components/PanoramaView'

// Panorama (landing). Protegido por nginx auth_request (ADR-014): Nginx verifica la sesion
// en /_auth antes de llegar aqui. El middleware puede anadirse como capa adicional.
export default function Page() {
  return (
    <div className="app">
      <Sidebar actual="panorama" />
      <PanoramaView />
    </div>
  )
}
