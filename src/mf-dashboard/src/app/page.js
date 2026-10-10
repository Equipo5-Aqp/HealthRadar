import Sidebar from '@/modules/shared/components/Sidebar'
import PanoramaView from '@/modules/panorama/components/PanoramaView'

// Panorama (landing). La protección por sesión la aplica nginx (auth_request) o el middleware, según ADR-014.
export default function Page() {
  return (
    <div className="app">
      <Sidebar actual="panorama" />
      <PanoramaView />
    </div>
  )
}
