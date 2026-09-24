import './globals.css'

export const metadata = {
  title: 'HealthRadar — Datos Históricos',
  description: 'Exploración de datos epidemiológicos históricos por departamento y año.',
}

export default function RootLayout({ children }) {
  return <html lang="es"><body>{children}</body></html>
}
