import './globals.css'

export const metadata = {
  title: 'HealthRadar — Datos históricos',
  description: 'Registros históricos y mapa de calor por departamento: dengue, IRA y EDA en Perú.',
}

// Aplica el tema guardado ANTES de pintar (evita el parpadeo claro→oscuro).
// Clave compartida entre microfrontends: "hr-tema" (mismo origen).
const SCRIPT_TEMA =
  "try{var t=localStorage.getItem('hr-tema');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}"

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
