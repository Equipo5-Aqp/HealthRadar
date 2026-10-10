import MapaView from '@/modules/mapa/components/MapaView'

export const metadata = { title: 'HealthRadar — Mapa de calor' }

// Mapa de calor por departamento (HU-9). Ruta pública: /historicos/mapa
export default function Page() {
  return <MapaView />
}
