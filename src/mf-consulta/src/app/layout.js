import './globals.css'

export const metadata = {
  title: 'HealthRadar — Consulta NLQ',
  description: 'Consulta epidemiológica en lenguaje natural. Dengue, EDA e IRA en Perú.',
}

export default function RootLayout({ children }) {
  return <html lang="es"><body>{children}</body></html>
}
