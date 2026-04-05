'use client'

import { useState } from 'react'
import { TrialBanner } from '@/components/marketing/TrialBanner'

const guardOptions = [
  { value: '1-25', label: '1 — 25 guardias' },
  { value: '26-100', label: '26 — 100 guardias' },
  { value: '101-300', label: '101 — 300 guardias' },
  { value: '301-500', label: '301 — 500 guardias' },
  { value: '500+', label: '500+ guardias' },
]

const benefits = [
  'Acceso completo a todos los módulos durante 30 días',
  'Face ID, rondas GPS y alertas WhatsApp incluidas',
  'IA operacional: help chat RAG, OCR, análisis',
  '6 portales: Admin, Operaciones, RRHH, Finanzas, Cliente, Guardia',
  'App móvil iOS y Android para guardias',
  'Soporte por WhatsApp durante tu prueba',
  'Tus datos seguros — migración asistida si decides continuar',
]

const timelineSteps = [
  {
    day: 'Día 1',
    title: 'Crea tu cuenta',
    text: 'Configura tu empresa, sube tu logo y agrega tus primeros guardias e instalaciones.',
  },
  {
    day: 'Día 2-7',
    title: 'Operaciones en vivo',
    text: 'Activa Face ID, configura rondas GPS con checkpoints y prueba las alertas WhatsApp.',
  },
  {
    day: 'Día 8-20',
    title: 'Explora el potencial',
    text: 'Usa el CRM, genera cotizaciones, prueba la nómina y comparte el portal del cliente.',
  },
  {
    day: 'Día 21-30',
    title: 'Decide con datos',
    text: 'Revisa métricas, reportes y el impacto real en tu operación. Sin presión.',
  },
]

const faqs = [
  {
    q: '¿Necesito tarjeta de crédito para la prueba gratuita?',
    a: 'No. Los 30 días de prueba son completamente gratis y no requieren tarjeta de crédito ni ningún dato de pago.',
  },
  {
    q: '¿Qué pasa después de los 30 días?',
    a: 'Tu cuenta se pausa automáticamente. No se cobra nada. Si quieres continuar, eliges un plan y activas tu suscripción. Si no, tus datos se mantienen por 30 días más por si cambias de opinión.',
  },
  {
    q: '¿Puedo migrar mis datos desde otro sistema?',
    a: 'Sí. Ofrecemos migración asistida gratuita desde Excel, otros ERPs o sistemas propios. Te ayudamos a importar guardias, instalaciones, clientes y contratos.',
  },
  {
    q: '¿Cuánto cuesta después de la prueba?',
    a: 'Los planes comienzan desde UF 0.12 por guardia activo al mes (plan Starter). Sin contratos mínimos, cancela cuando quieras.',
  },
]

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

export default function RegistrarsePage() {
  const [form, setForm] = useState({
    nombre: '',
    empresa: '',
    email: '',
    whatsapp: '',
    guardias: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams({
      nombre: form.nombre,
      empresa: form.empresa,
      email: form.email,
      whatsapp: form.whatsapp,
      guardias: form.guardias,
    })
    window.location.href = `${process.env.NEXT_PUBLIC_APP_URL || ""}/registro?${params.toString()}`
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* Two-column layout */}
      <section className="mk-section">
        <div className="mk-container">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
              gap: 'clamp(32px, 5vw, 64px)',
              alignItems: 'start',
            }}
          >
            {/* Left Column: Benefits */}
            <div>
              <div className="mk-label">
                <div className="mk-pulse" />
                30 días gratis
              </div>
              <h1
                style={{
                  fontFamily: 'var(--mk-font-h)',
                  fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
                  fontWeight: 800,
                  lineHeight: 1.1,
                  marginBottom: '24px',
                }}
              >
                Crea tu cuenta gratis — 30 días sin tarjeta
              </h1>
              <p
                style={{
                  color: 'var(--mk-muted)',
                  fontSize: 'clamp(0.95rem, 1.5vw, 1.05rem)',
                  lineHeight: 1.75,
                  marginBottom: '32px',
                  maxWidth: '480px',
                }}
              >
                Prueba OPAI con todas las funcionalidades, sin límites y sin
                compromisos. En 2 minutos tienes tu cuenta lista para operar.
              </p>

              {/* Benefits checklist */}
              <div style={{ marginBottom: '40px' }}>
                <h3
                  style={{
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    marginBottom: '16px',
                  }}
                >
                  Tu prueba incluye:
                </h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {benefits.map((b) => (
                    <li
                      key={b}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        marginBottom: '12px',
                        fontSize: '0.9rem',
                        color: 'var(--mk-muted)',
                        lineHeight: 1.5,
                      }}
                    >
                      <span
                        style={{
                          color: 'var(--mk-teal)',
                          fontWeight: 700,
                          flexShrink: 0,
                          marginTop: '1px',
                        }}
                      >
                        ✓
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Testimonial */}
              <div
                className="mk-card"
                style={{
                  padding: 'clamp(20px, 3vw, 28px)',
                  borderLeft: '3px solid var(--mk-teal)',
                  marginBottom: '40px',
                }}
              >
                <p
                  style={{
                    color: 'var(--mk-muted)',
                    fontSize: '0.9rem',
                    lineHeight: 1.75,
                    fontStyle: 'italic',
                    marginBottom: '12px',
                  }}
                >
                  &ldquo;En 15 años operando empresas de seguridad privada nunca encontramos un software que
                  realmente entendiera nuestro negocio. Por eso construimos OPAI.&rdquo;
                </p>
                <p
                  style={{
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'var(--mk-text)',
                  }}
                >
                  Equipo Fundador
                  <span style={{ color: 'var(--mk-muted)', fontWeight: 400, marginLeft: '8px' }}>
                    OPAI
                  </span>
                </p>
              </div>

              {/* Timeline */}
              <div>
                <h3
                  style={{
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    marginBottom: '20px',
                  }}
                >
                  Tu primer mes con OPAI
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {timelineSteps.map((t) => (
                    <div
                      key={t.day}
                      style={{
                        display: 'flex',
                        gap: '16px',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div
                        style={{
                          fontFamily: 'var(--mk-font-m)',
                          fontSize: '0.75rem',
                          color: 'var(--mk-teal)',
                          letterSpacing: '0.05em',
                          flexShrink: 0,
                          minWidth: '72px',
                          paddingTop: '2px',
                        }}
                      >
                        {t.day}
                      </div>
                      <div>
                        <div
                          style={{
                            fontFamily: 'var(--mk-font-h)',
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            marginBottom: '4px',
                          }}
                        >
                          {t.title}
                        </div>
                        <p
                          style={{
                            color: 'var(--mk-muted)',
                            fontSize: '0.85rem',
                            lineHeight: 1.6,
                          }}
                        >
                          {t.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Form */}
            <div>
              <div
                className="mk-card"
                style={{
                  padding: 'clamp(28px, 4vw, 40px)',
                  position: 'sticky',
                  top: '88px',
                }}
              >
                <h2
                  style={{
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: '1.3rem',
                    fontWeight: 700,
                    marginBottom: '8px',
                  }}
                >
                  Crea tu cuenta
                </h2>
                <p
                  style={{
                    color: 'var(--mk-muted)',
                    fontSize: '0.88rem',
                    lineHeight: 1.6,
                    marginBottom: '28px',
                  }}
                >
                  Completa el formulario y comienza a operar en minutos.
                </p>

                <form
                  onSubmit={handleSubmit}
                  style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}
                >
                  <div>
                    <label htmlFor="nombre" style={labelStyle}>
                      Nombre
                    </label>
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
                    <label htmlFor="empresa" style={labelStyle}>
                      Empresa
                    </label>
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
                    <label htmlFor="email" style={labelStyle}>
                      Email corporativo
                    </label>
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
                    <label htmlFor="whatsapp" style={labelStyle}>
                      WhatsApp / Teléfono
                    </label>
                    <input
                      id="whatsapp"
                      name="whatsapp"
                      type="tel"
                      required
                      value={form.whatsapp}
                      onChange={handleChange}
                      placeholder="+56 9 XXXX XXXX"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label htmlFor="guardias" style={labelStyle}>
                      ¿Cuántos guardias tienes?
                    </label>
                    <select
                      id="guardias"
                      name="guardias"
                      required
                      value={form.guardias}
                      onChange={handleChange}
                      style={{
                        ...inputStyle,
                        appearance: 'auto',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="" disabled>
                        Selecciona un rango
                      </option>
                      {guardOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="mk-btn-primary"
                    style={{
                      width: '100%',
                      justifyContent: 'center',
                      padding: '16px 28px',
                      fontSize: '1rem',
                      marginTop: '8px',
                    }}
                  >
                    Crear cuenta gratis →
                  </button>
                </form>

                <p
                  style={{
                    textAlign: 'center',
                    marginTop: '16px',
                    fontFamily: 'var(--mk-font-m)',
                    fontSize: '0.75rem',
                    color: 'var(--mk-muted)',
                    letterSpacing: '0.03em',
                    lineHeight: 1.6,
                  }}
                >
                  Sin spam &nbsp;·&nbsp; Sin tarjeta de crédito &nbsp;·&nbsp; Sin compromiso
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container">
          <div className="mk-label">
            <div className="mk-pulse" />
            Preguntas frecuentes
          </div>
          <h2
            style={{
              fontFamily: 'var(--mk-font-h)',
              fontSize: 'clamp(1.5rem, 3.5vw, 2.4rem)',
              fontWeight: 700,
              marginBottom: '48px',
              lineHeight: 1.15,
            }}
          >
            Sobre la prueba gratuita
          </h2>
          <div style={{ maxWidth: '700px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {faqs.map((f) => (
              <div
                key={f.q}
                className="mk-card"
                style={{ padding: 'clamp(20px, 3vw, 28px)' }}
              >
                <h3
                  style={{
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: '1rem',
                    fontWeight: 700,
                    marginBottom: '8px',
                    lineHeight: 1.4,
                  }}
                >
                  {f.q}
                </h3>
                <p style={{ color: 'var(--mk-muted)', fontSize: '0.9rem', lineHeight: 1.75 }}>
                  {f.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <TrialBanner />
    </>
  )
}
