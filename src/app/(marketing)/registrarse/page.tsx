'use client'

import { useState, useEffect } from 'react'
import { TrialBanner } from '@/components/marketing/TrialBanner'

const benefits = [
  'Acceso completo a todos los módulos',
  'Face ID, rondas GPS y alertas WhatsApp incluidas',
  'IA operacional: help chat RAG, OCR, análisis',
  '6 portales: Admin, Operaciones, RRHH, Finanzas, Cliente, Guardia',
  'App móvil iOS y Android para guardias',
  'Soporte por WhatsApp durante tu prueba',
  'Tus datos seguros — migración asistida si decides continuar',
]

const timelineSteps = [
  { day: 'Día 1', title: 'Crea tu cuenta', text: 'Configura tu empresa, sube tu logo y agrega tus primeros guardias e instalaciones.' },
  { day: 'Día 2-7', title: 'Operaciones en vivo', text: 'Activa Face ID, configura rondas GPS con checkpoints y prueba las alertas WhatsApp.' },
  { day: 'Día 8-20', title: 'Explora el potencial', text: 'Usa el CRM, genera cotizaciones, prueba la nómina y comparte el portal del cliente.' },
  { day: 'Día 21-30', title: 'Decide con datos', text: 'Revisa métricas, reportes y el impacto real en tu operación. Sin presión.' },
]

const faqs = [
  { q: '¿Necesito tarjeta de crédito para la prueba gratuita?', a: 'No. La prueba es completamente gratis y no requiere tarjeta de crédito ni ningún dato de pago.' },
  { q: '¿Qué pasa si quiero funcionalidades avanzadas?', a: 'Eliges un plan pagado y activas tu suscripción. Si prefieres seguir con el plan gratis, tus datos se mantienen sin límite de tiempo.' },
  { q: '¿Puedo migrar mis datos desde otro sistema?', a: 'Sí. Ofrecemos migración asistida gratuita desde Excel, otros ERPs o sistemas propios. Te ayudamos a importar guardias, instalaciones, clientes y contratos.' },
  { q: '¿Cuánto cuesta después de la prueba?', a: 'Los planes comienzan desde UF 0.12 por guardia activo al mes (plan Starter). Sin contratos mínimos, cancela cuando quieras.' },
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
  const [email, setEmail] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const e = params.get('email')
    if (e) setEmail(e)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const params = new URLSearchParams()
    if (email) params.set('email', email)

    if (typeof window !== 'undefined') {
      const incoming = new URLSearchParams(window.location.search)
      for (const k of ['utm_source', 'utm_campaign', 'utm_medium', 'utm_term', 'utm_content', 'ref']) {
        const v = incoming.get(k)
        if (v) params.set(k, v)
      }
    }

    // Path relativo intencional: NEXT_PUBLIC_APP_URL puede apuntar a un
    // subdominio autenticado y rompía el flujo redirigiendo a login.
    window.location.href = `/registro?${params.toString()}`
  }

  const focusEmail = (e: React.MouseEvent) => {
    e.preventDefault()
    const el = document.getElementById('email')
    el?.focus()
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <TrialBanner />

      <main className="mk-grid-bg" style={{ paddingTop: 60, paddingBottom: 80 }}>
        <div className="mk-container">
          <section style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 48, alignItems: 'center', maxWidth: 1100, margin: '0 auto', padding: '64px 0' }}>
            <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
              <span className="mk-label">
                <span className="mk-pulse" />
                30 días gratis · Plan Profesional
              </span>
              <h1 style={{
                fontFamily: 'var(--mk-font-h)',
                fontSize: 'clamp(36px, 6vw, 56px)',
                fontWeight: 800,
                lineHeight: 1.05,
                margin: '0 0 16px',
                color: 'var(--mk-text)',
                letterSpacing: '-0.02em',
              }}>
                Empieza gratis en <span style={{ color: 'var(--mk-teal)' }}>menos de 2 minutos</span>
              </h1>
              <p style={{ fontSize: 18, color: 'var(--mk-muted)', lineHeight: 1.6, margin: '0 auto 40px', maxWidth: 560 }}>
                Sin tarjeta de crédito. Sin contratos. Acceso completo al plan Profesional por 30 días, después pasa a Gratis automáticamente.
              </p>

              <form onSubmit={handleSubmit} style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                  <label htmlFor="email" style={{ display: 'block', fontSize: 13, color: 'var(--mk-text)', fontWeight: 500, textAlign: 'left' }}>
                    Email corporativo
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@empresa.cl"
                    style={{
                      background: 'var(--mk-bg-card)',
                      border: '1px solid var(--mk-border)',
                      borderRadius: 8,
                      padding: '14px 16px',
                      fontFamily: 'var(--mk-font-b)',
                      fontSize: 15,
                      color: 'var(--mk-text)',
                      width: '100%',
                      outline: 'none',
                    }}
                    autoComplete="email"
                  />
                </div>
                <button
                  type="submit"
                  className="mk-btn-primary"
                  style={{ padding: '16px 32px', fontSize: 16, justifyContent: 'center' }}
                >
                  Empezar gratis →
                </button>
                <p style={{ fontSize: 12, color: 'var(--mk-muted)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
                  Sin tarjeta de crédito · 30 días Profesional gratis · Plan Gratis para siempre
                </p>
              </form>
            </div>
          </section>

          <section style={{ padding: '64px 0', borderTop: '1px solid var(--mk-border)' }}>
            <h2 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, textAlign: 'center', margin: '0 0 32px', color: 'var(--mk-text)' }}>
              Todo incluido durante tu prueba
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, maxWidth: 920, margin: '0 auto' }}>
              {benefits.map((b) => (
                <div key={b} className="mk-card" style={{ padding: 20, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--mk-teal-dim)', border: '1px solid var(--mk-teal-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--mk-teal)', fontSize: 12, fontWeight: 700 }}>✓</span>
                  <span style={{ fontSize: 14, color: 'var(--mk-text)', lineHeight: 1.5 }}>{b}</span>
                </div>
              ))}
            </div>
          </section>

          <section style={{ padding: '64px 0', borderTop: '1px solid var(--mk-border)' }}>
            <h2 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, textAlign: 'center', margin: '0 0 48px', color: 'var(--mk-text)' }}>
              Tu mes de prueba, día por día
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24, maxWidth: 1080, margin: '0 auto' }}>
              {timelineSteps.map((s) => (
                <div key={s.day} className="mk-card" style={{ padding: 24 }}>
                  <span style={{ fontFamily: 'var(--mk-font-m)', fontSize: 11, color: 'var(--mk-teal)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                    {s.day}
                  </span>
                  <h3 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 18, fontWeight: 700, margin: '8px 0 8px', color: 'var(--mk-text)' }}>{s.title}</h3>
                  <p style={{ fontSize: 14, color: 'var(--mk-muted)', lineHeight: 1.6, margin: 0 }}>{s.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ padding: '64px 0', borderTop: '1px solid var(--mk-border)' }}>
            <h2 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, textAlign: 'center', margin: '0 0 32px', color: 'var(--mk-text)' }}>
              Preguntas frecuentes
            </h2>
            <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {faqs.map((f) => (
                <details key={f.q} className="mk-card" style={{ padding: 20 }}>
                  <summary style={{ fontWeight: 600, fontSize: 15, color: 'var(--mk-text)', cursor: 'pointer', listStyle: 'none' }}>{f.q}</summary>
                  <p style={{ fontSize: 14, color: 'var(--mk-muted)', lineHeight: 1.6, margin: '12px 0 0' }}>{f.a}</p>
                </details>
              ))}
            </div>
          </section>

          <section style={{ padding: '64px 0', textAlign: 'center', borderTop: '1px solid var(--mk-border)' }}>
            <h2 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 700, margin: '0 0 16px', color: 'var(--mk-text)' }}>
              ¿Listo para empezar?
            </h2>
            <p style={{ fontSize: 16, color: 'var(--mk-muted)', margin: '0 0 24px' }}>
              90 segundos. Sin tarjeta. Acceso completo.
            </p>
            <a
              href="#"
              onClick={focusEmail}
              className="mk-btn-primary"
              style={{ padding: '16px 32px', fontSize: 16 }}
            >
              Empezar mi prueba gratis →
            </a>
          </section>
        </div>
      </main>
    </>
  )
}
