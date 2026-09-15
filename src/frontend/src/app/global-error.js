'use client'

export default function GlobalError({ reset }) {
  return (
    <html lang="es">
      <body
        style={{
          background: '#0B1420',
          color: '#EAF2FA',
          fontFamily: 'Inter, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          margin: 0,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: 16 }}>Algo salió mal.</h2>
          <button
            onClick={() => reset()}
            style={{
              padding: '10px 24px',
              background: '#FF6B4A',
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  )
}
