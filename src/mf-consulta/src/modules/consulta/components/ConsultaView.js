'use client'

import { useEffect, useRef } from 'react'
import Sidebar from '@/modules/shared/components/Sidebar'
import { useConsultaNLQ } from '../hooks/useConsultaNLQ'
import { SUGERENCIAS } from '../constants'
import ChatMensaje from './ChatMensaje'

export default function ConsultaView() {
  const c = useConsultaNLQ()
  const finRef = useRef(null)
  const inputRef = useRef(null)
  const preguntas = c.mensajes.filter((m) => m.rol === 'user')

  // Lleva la vista al último mensaje cada vez que llega uno o aparece el indicador de espera.
  useEffect(() => { finRef.current?.scrollIntoView({ block: 'end' }) }, [c.mensajes, c.cargando])

  function irAlMensaje(id) {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ block: 'center' })
  }

  function enviar(e) {
    e.preventDefault()
    c.consultar()
  }

  return (
    <div className="app">
      <Sidebar actual="consulta" />
      <main className="main">
        <header className="page-head">
          <div>
            <h1>Consulta</h1>
            <p>Pregunta en lenguaje natural sobre dengue, IRA y EDA en el Perú</p>
          </div>
        </header>

        <div className="row chat-row">
          <section className="card chat" aria-label="Conversación">
            <div className="chat-log" role="log" aria-live="polite" aria-relevant="additions">
              {c.mensajes.length === 0 && !c.cargando && (
                <div className="chat-vacio">
                  <strong>¿Qué quieres saber?</strong>
                  <span>Busco en los boletines y en el historial de casos. Puedes seguir preguntando: recuerdo lo anterior de esta conversación.</span>
                </div>
              )}
              {c.mensajes.map((m) => <ChatMensaje key={m.id} m={m} />)}
              {c.cargando && (
                <div className="msg-bot escribiendo" role="status">
                  <span className="sr-only">Analizando los datos epidemiológicos…</span>
                  <span className="puntos" aria-hidden="true"><i /><i /><i /></span>
                  <span aria-hidden="true">Analizando los datos epidemiológicos…</span>
                </div>
              )}
              <div ref={finRef} />
            </div>

            <div className="chat-foot">
              {c.mensajes.length === 0 && (
                <div className="chips">
                  {SUGERENCIAS.map((s) => (
                    <button key={s} type="button" className="chip" disabled={c.cargando} onClick={() => c.consultar(s)}>{s}</button>
                  ))}
                </div>
              )}
              <form className="chat-form" onSubmit={enviar}>
                <label className="sr-only" htmlFor="pregunta">Escribe tu pregunta</label>
                <input
                  id="pregunta" ref={inputRef} type="text" autoComplete="off" maxLength={500}
                  placeholder="Pregunta sobre dengue, IRA o EDA…"
                  value={c.pregunta} onChange={(e) => c.setPregunta(e.target.value)} disabled={c.cargando}
                />
                <button type="submit" className="btn-primary" disabled={c.cargando || !c.pregunta.trim()}>Enviar</button>
              </form>
            </div>
          </section>

          <aside className="card history" aria-label="Historial de consultas">
            <h2>Historial de esta sesión</h2>
            {preguntas.length === 0 ? (
              <p className="history-vacio">Aún no hay preguntas en esta conversación.</p>
            ) : (
              <ul>
                {[...preguntas].reverse().map((m, i) => (
                  <li key={m.id} className={i === 0 ? 'on' : undefined}>
                    <button type="button" onClick={() => irAlMensaje(m.id)}>{m.texto}</button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="btn-ghost" disabled={c.cargando || c.mensajes.length === 0}
              onClick={() => { c.nuevaConversacion(); inputRef.current?.focus() }}>
              Nueva conversación
            </button>
          </aside>
        </div>
      </main>
    </div>
  )
}
