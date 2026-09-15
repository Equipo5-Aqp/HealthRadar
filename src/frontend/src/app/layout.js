import "./globals.css";

export const metadata = {
  title: "HealthRadar — Consulta (Next.js)",
  description: "Microfrontend de prueba - modulo de consulta en lenguaje natural",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es"> 
      <body>{children}</body>
    </html>
  );
}
