'use client'

import { useState } from 'react'
import { useLogin } from '../hooks/useLogin'

export default function LoginForm() {
  const { email, setEmail, password, setPassword, cargando, error, enviar } = useLogin()
  const [ver, setVer] = useState(false)

  return (
    <div className="login-page">
      <header className="login-top">
        <div className="brand">
          <div className="brand-logo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12l6-6" /></svg>
          </div>
          <div className="brand-name">HealthRadar</div>
        </div>
      </header>

      <main className="login-main">
        <form className="login-card" onSubmit={enviar} noValidate>
          <div className="login-kicker">Vigilancia epidemiológica</div>
          <h1>Iniciar sesión</h1>
          <p className="login-sub">Acceso restringido a analistas autorizados</p>

          <label htmlFor="hr-email">Correo</label>
          <input
            id="hr-email" name="email" type="email" autoComplete="username" inputMode="email"
            className="login-input" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@ejemplo.com" disabled={cargando}
            aria-invalid={error ? 'true' : 'false'} autoFocus
          />

          <label htmlFor="hr-password">Contraseña</label>
          <div className="login-pass">
            <input
              id="hr-password" name="password" type={ver ? 'text' : 'password'} autoComplete="current-password"
              className="login-input" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" disabled={cargando} aria-invalid={error ? 'true' : 'false'}
            />
            <button type="button" className="login-ver" onClick={() => setVer((v) => !v)} disabled={cargando} aria-pressed={ver}>
              {ver ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>

          <div className="login-error" role="alert" aria-live="polite">{error}</div>

          <button type="submit" className="btn-primary" disabled={cargando}>
            {cargando ? 'Ingresando…' : 'Ingresar al sistema'}
          </button>
        </form>
      </main>

      <footer className="login-foot">HealthRadar · Proyecto académico de vigilancia epidemiológica</footer>
    </div>
  )
}
