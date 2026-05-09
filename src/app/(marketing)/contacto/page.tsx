'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

/* Metadata must be exported from a server component; since this is 'use client',
   we rely on the parent layout metadata + a <title> via head is not possible.
   We set metadata in a separate layout or via generateMetadata in a wrapper.
   For simplicity we use document.title approach — but ideally a server wrapper is used.
   The parent layout template handles the title. */

const contactInfo = [
  {
    label: 'WhatsApp',
    value: '+56 9 6872 7644',
    href: 'https://wa.me/56968727644',
    icon: '💬',
  },
  {
    label: 'Email',
    value: 'carlos.irigoyen@opai.cl',
    href: 'mailto:carlos.irigoyen@opai.cl',
    icon: '📧',
  },
  {
    label: 'Ubicación',
    value: 'Santiago, Chile',
    href: null,
    icon: '📍',
  },
]

export default function ContactoPage() {
  const [form, setForm] = useState({
    nombre: '',
    empresa: '',
    email: '',
    telefono: '',
    mensaje: '',
  })
  const [submitted, setSubmitted] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/marketing/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Error al enviar')
      setSubmitted(true)
    } catch {
      setError('No se pudo enviar el mensaje. Intenta de nuevo o escríbenos por WhatsApp.')
    } finally {
      setSending(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    background: 'var(--mk-bg-card)',
    border: '1px solid var(--mk-border)',
    borderRadius: '4px',
    color: 'var(--mk-text)',
    fontFamily: 'var(--mk-font-b)',
    fontSize: '0.9rem',
    outline: 'none',
    transition: 'border-color 0.2s',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: 'var(--mk-font-h)',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--mk-muted)',
    marginBottom: '6px',
  }

  return (
    <>
      {/* Hero */}
      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="mk-container">
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            Contacto
          </div>
          <h1
            style={{
              fontFamily: 'var(--mk-font-h)',
              fontSize: 'clamp(2rem, 5vw, 3.4rem)',
              fontWeight: 800,
              lineHeight: 1.1,
              maxWidth: '600px',
              margin: '0 auto 24px',
            }}
          >
            Hablemos de tu empresa
          </h1>
          <p
            style={{
              color: 'var(--mk-muted)',
              fontSize: 'clamp(1rem, 2vw, 1.15rem)',
              lineHeight: 1.75,
              maxWidth: '540px',
              margin: '0 auto',
            }}
          >
            Escríbenos y te respondemos en menos de 24 horas. Sin spam,
            sin vendedores agresivos — solo respuestas claras.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
              gap: 'clamp(32px, 5vw, 64px)',
              alignItems: 'start',
            }}
          >
            {/* Form */}
            <div>
              <h2
                style={{
                  fontFamily: 'var(--mk-font-h)',
                  fontSize: '1.3rem',
                  fontWeight: 700,
                  marginBottom: '28px',
                }}
              >
                Envíanos un mensaje
              </h2>

              {submitted ? (
                <div
                  className="mk-card"
                  style={{
                    padding: 'clamp(32px, 4vw, 48px)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '2rem', marginBottom: '16px' }}>✓</div>
                  <h3
                    style={{
                      fontFamily: 'var(--mk-font-h)',
                      fontSize: '1.2rem',
                      fontWeight: 700,
                      marginBottom: '10px',
                    }}
                  >
                    Mensaje enviado
                  </h3>
                  <p style={{ color: 'var(--mk-muted)', fontSize: '0.9rem', lineHeight: 1.7 }}>
                    Te responderemos en menos de 24 horas. Revisa tu email
                    o WhatsApp.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <label htmlFor="nombre" style={labelStyle}>Nombre</label>
                    <input
                      id="nombre"
                      name="nombre"
                      type="text"
                      required
                      value={form.nombre}
                      onChange={handleChange}
                      placeholder="Tu nombre completo"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label htmlFor="empresa" style={labelStyle}>Empresa</label>
                    <input
                      id="empresa"
                      name="empresa"
                      type="text"
                      required
                      value={form.empresa}
                      onChange={handleChange}
                      placeholder="Nombre de tu empresa de seguridad"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label htmlFor="email" style={labelStyle}>Email</label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={form.email}
                      onChange={handleChange}
                      placeholder="tu@empresa.cl"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label htmlFor="telefono" style={labelStyle}>Teléfono</label>
                    <input
                      id="telefono"
                      name="telefono"
                      type="tel"
                      value={form.telefono}
                      onChange={handleChange}
                      placeholder="+56 9 XXXX XXXX"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label htmlFor="mensaje" style={labelStyle}>Mensaje</label>
                    <textarea
                      id="mensaje"
                      name="mensaje"
                      required
                      rows={5}
                      value={form.mensaje}
                      onChange={handleChange}
                      placeholder="Cuéntanos sobre tu empresa y qué necesitas..."
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  </div>
                  {error && (
                    <p style={{ color: 'var(--mk-orange)', fontSize: '0.88rem', margin: 0 }}>
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="mk-btn-primary"
                    disabled={sending}
                    style={{ alignSelf: 'flex-start', opacity: sending ? 0.6 : 1 }}
                  >
                    {sending ? 'Enviando...' : 'Enviar mensaje →'}
                  </button>
                </form>
              )}
            </div>

            {/* Contact Info */}
            <div>
              <h2
                style={{
                  fontFamily: 'var(--mk-font-h)',
                  fontSize: '1.3rem',
                  fontWeight: 700,
                  marginBottom: '28px',
                }}
              >
                Información de contacto
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {contactInfo.map((c) => (
                  <div
                    key={c.label}
                    className="mk-card"
                    style={{
                      padding: 'clamp(20px, 3vw, 24px)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                    }}
                  >
                    <div style={{ fontSize: '1.4rem', flexShrink: 0 }}>{c.icon}</div>
                    <div>
                      <div
                        style={{
                          fontFamily: 'var(--mk-font-h)',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: 'var(--mk-muted)',
                          marginBottom: '2px',
                        }}
                      >
                        {c.label}
                      </div>
                      {c.href ? (
                        <a
                          href={c.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: 'var(--mk-teal)',
                            textDecoration: 'none',
                            fontSize: '0.95rem',
                            fontWeight: 500,
                          }}
                        >
                          {c.value}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--mk-text)', fontSize: '0.95rem' }}>
                          {c.value}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="mk-card"
                style={{
                  marginTop: '28px',
                  padding: 'clamp(20px, 3vw, 28px)',
                  borderLeft: '3px solid var(--mk-teal)',
                }}
              >
                <h3
                  style={{
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: '1rem',
                    fontWeight: 700,
                    marginBottom: '8px',
                  }}
                >
                  Respuesta rápida
                </h3>
                <p style={{ color: 'var(--mk-muted)', fontSize: '0.88rem', lineHeight: 1.7 }}>
                  Para una respuesta inmediata, escríbenos por WhatsApp.
                  Respondemos en minutos durante horario laboral
                  (lunes a viernes, 9:00 a 18:00 hora Chile).
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <TrialBanner />
    </>
  )
}
