import ThemeToggle from './ThemeToggle'
import UserBox from '@/modules/auth/components/UserBox'

// Barra lateral del diseño. Cada microfrontend lleva su propia copia (ADR-013).
// Navegación entre zonas con <a href> nativo, nunca <Link> (Regla 4).
const ICONO = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

const IconoPanorama = () => (<svg {...ICONO}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>)
const IconoConsulta = () => (<svg {...ICONO}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>)
const IconoTabla = () => (<svg {...ICONO}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></svg>)
const IconoMapa = () => (<svg {...ICONO}><path d="M9 4L3 6.5v13L9 17l6 3 6-2.5v-13L15 7z" /><path d="M9 4v13M15 7v13" /></svg>)

// `actual`: 'panorama' (en este MF siempre es panorama)
export default function Sidebar({ actual = 'panorama' }) {
  const cur = (id) => (actual === id ? 'page' : undefined)
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">
          <svg {...ICONO}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12l6-6" /></svg>
        </div>
        <div className="brand-name">HealthRadar</div>
      </div>
      <nav className="nav" aria-label="Navegación principal">
        <a href="/" aria-current={cur('panorama')}><IconoPanorama />Panorama</a>
        <a href="/consulta" aria-current={cur('consulta')}><IconoConsulta />Consulta</a>
        <div className="nav-group">Datos históricos</div>
        <a href="/historicos" aria-current={cur('tabla')}><IconoTabla />Tabla</a>
        <a href="/historicos/mapa" aria-current={cur('mapa')}><IconoMapa />Mapa de calor</a>
      </nav>
      <div className="side-bottom">
        <ThemeToggle />
        <UserBox />
      </div>
    </aside>
  )
}
