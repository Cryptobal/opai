import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'Nosotros — Quiénes construyeron OPAI | LX3.ai',
  description:
    'OPAI fue creado por un equipo fundador con más de 15 años de experiencia operando empresas OS10 de seguridad privada en Chile. Construido desde la trinchera.',
  alternates: { canonical: 'https://www.opai.cl/nosotros' },
  openGraph: {
    title: 'Nosotros — Quiénes construyeron OPAI | LX3.ai',
    description:
      'La historia detrás de OPAI: un equipo con 15+ años en seguridad privada, experiencia real y tecnología de clase mundial.',
    url: 'https://www.opai.cl/nosotros',
    type: 'website',
    images: [{ url: '/icons/og-image.png', width: 1200, height: 630, alt: 'OPAI — ERP con IA para Seguridad Privada' }],
  },
}

const stats = [
  { value: '259', label: 'Modelos de datos' },
  { value: '801', label: 'Endpoints API' },
  { value: '18', label: 'Automatizaciones' },
  { value: '6', label: 'Portales especializados' },
  { value: '15+', label: 'Años en seguridad privada' },
  { value: '12', label: 'Integraciones tecnológicas' },
]

const team = [
  {
    initials: 'CI',
    name: 'Carlos Irigoyen',
    role: 'Fundador & CEO',
    desc: 'Más de 15 años operando empresas OS10 de seguridad privada en Chile. Diseñó OPAI desde la experiencia real de gestionar guardias, rondas y operaciones.',
    linkedin: 'https://www.linkedin.com/in/carlosirigoyen/',
  },
]

const techStack = [
  { layer: 'Frontend', items: ['Next.js 16', 'React 19', 'TypeScript', 'Tailwind CSS'] },
  { layer: 'Backend', items: ['Node.js', 'Prisma ORM', '801 API endpoints', 'NextAuth'] },
  { layer: 'IA & ML', items: ['OpenAI GPT-4o', 'Anthropic Claude', 'pgvector', 'RAG'] },
  { layer: 'Integraciones', items: ['AWS Rekognition', 'Twilio', 'Resend', 'Fintoc'] },
  { layer: 'Infra', items: ['Vercel', 'PostgreSQL', 'Cloudflare R2', 'Sentry'] },
  { layer: 'Mobile', items: ['Capacitor', 'PWA', 'Push Notifications', 'GPS nativo'] },
]

const timeline = [
  {
    period: 'Los inicios',
    icon: '🏗️',
    title: 'La trinchera de la seguridad privada',
    text: 'Nuestro equipo fundador viene de operar empresas OS10 de seguridad privada por más de 15 años. Vivimos en carne propia los problemas de la industria: guardias que no llegan, rondas que no se cumplen, planillas en Excel, nóminas manuales y clientes sin visibilidad.',
  },
  {
    period: 'La frustración',
    icon: '😤',
    title: 'ERPs genéricos no sirven',
    text: 'Probó SAP, Odoo, sistemas hechos a medida en Chile. Ninguno entendía la seguridad privada. Todos requerían meses de customización, costaban una fortuna y al final no resolvían el problema real: la operación diaria de una empresa de guardias.',
  },
  {
    period: 'La decisión',
    icon: '🚀',
    title: 'Construirlo desde cero',
    text: 'Si ningún software entiende la seguridad privada, hay que construir uno que sí lo haga. Nace LX3.ai con una misión: crear el ERP que toda empresa de seguridad privada necesita pero que no existía.',
  },
  {
    period: 'Hoy',
    icon: '✅',
    title: 'OPAI en producción',
    text: 'OPAI es un sistema probado en producción real con 259 modelos Prisma, 801 endpoints, 18 automatizaciones y 6 portales especializados. Face ID, GPS, IA, WhatsApp — todo lo que la industria necesita, en una sola plataforma.',
  },
]

export default function NosotrosPage() {
  return (
    <>
      {/* Hero */}
      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="mk-container">
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            Nuestra historia
          </div>
          <h1
            style={{
              fontFamily: 'var(--mk-font-h)',
              fontSize: 'clamp(2rem, 5vw, 3.4rem)',
              fontWeight: 800,
              lineHeight: 1.1,
              maxWidth: '700px',
              margin: '0 auto 24px',
            }}
          >
            Construido por quienes conocen la seguridad privada desde adentro
          </h1>
          <p
            style={{
              color: 'var(--mk-muted)',
              fontSize: 'clamp(1rem, 2vw, 1.15rem)',
              lineHeight: 1.75,
              maxWidth: '640px',
              margin: '0 auto',
            }}
          >
            OPAI no fue creado por una startup de Silicon Valley que nunca ha visto
            un guardia de seguridad. Nació de la experiencia real operando una empresa
            OS10 en Chile por más de 15 años.
          </p>
        </div>
      </section>

      {/* Story Timeline */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container">
          <div className="mk-label">
            <div className="mk-pulse" />
            La historia
          </div>
          <h2
            style={{
              fontFamily: 'var(--mk-font-h)',
              fontSize: 'clamp(1.5rem, 3.5vw, 2.4rem)',
              fontWeight: 700,
              marginBottom: '48px',
              lineHeight: 1.15,
              maxWidth: '500px',
            }}
          >
            De la trinchera al software
          </h2>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '28px',
              maxWidth: '700px',
            }}
          >
            {timeline.map((t, i) => (
              <div
                key={t.period}
                className="mk-card"
                style={{
                  padding: 'clamp(24px, 3vw, 32px)',
                  borderLeft: '3px solid var(--mk-teal)',
                }}
              >
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '1.2rem' }} role="img" aria-label={t.period}>{t.icon}</span>
                  <span style={{
                    fontFamily: 'var(--mk-font-m)',
                    fontSize: '0.75rem',
                    color: 'var(--mk-teal)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}>
                    {t.period}
                  </span>
                </div>
                <h3
                  style={{
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    marginBottom: '10px',
                  }}
                >
                  {t.title}
                </h3>
                <p
                  style={{
                    color: 'var(--mk-muted)',
                    fontSize: '0.9rem',
                    lineHeight: 1.75,
                  }}
                >
                  {t.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container">
          <div className="mk-label">
            <div className="mk-pulse" />
            Equipo
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
            Quiénes están detrás
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
              gap: '24px',
              maxWidth: '700px',
            }}
          >
            {team.map((m) => (
              <div key={m.name} className="mk-card" style={{ padding: 'clamp(28px, 3vw, 36px)' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
                  {/* Avatar placeholder */}
                  <div style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '4px',
                    background: 'var(--mk-teal-dim)',
                    border: '1px solid var(--mk-teal-glow)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--mk-font-m)',
                    fontSize: '18px',
                    fontWeight: 700,
                    color: 'var(--mk-teal)',
                    flexShrink: 0,
                  }}>
                    {m.initials}
                  </div>
                  <div>
                    <h3 style={{
                      fontFamily: 'var(--mk-font-h)',
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      color: 'var(--mk-text)',
                      marginBottom: '2px',
                    }}>
                      {m.name}
                    </h3>
                    <p style={{
                      fontFamily: 'var(--mk-font-m)',
                      fontSize: '0.8rem',
                      color: 'var(--mk-teal)',
                      letterSpacing: '0.04em',
                      margin: 0,
                    }}>
                      {m.role}
                    </p>
                  </div>
                </div>
                <p style={{ color: 'var(--mk-muted)', fontSize: '0.9rem', lineHeight: 1.75, marginBottom: '16px' }}>
                  {m.desc}
                </p>
                {m.linkedin && (
                  <a
                    href={m.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontFamily: 'var(--mk-font-m)',
                      fontSize: '0.8rem',
                      color: 'var(--mk-teal)',
                      textDecoration: 'none',
                    }}
                  >
                    LinkedIn →
                  </a>
                )}
              </div>
            ))}
            <div className="mk-card" style={{ padding: 'clamp(28px, 3vw, 36px)' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '4px',
                  background: 'var(--mk-teal-dim)',
                  border: '1px solid var(--mk-teal-glow)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--mk-font-m)',
                  fontSize: '18px',
                  fontWeight: 700,
                  color: 'var(--mk-teal)',
                  flexShrink: 0,
                }}>
                  L3
                </div>
                <div>
                  <h3 style={{
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    color: 'var(--mk-text)',
                    marginBottom: '2px',
                  }}>
                    LX3.ai
                  </h3>
                  <p style={{
                    fontFamily: 'var(--mk-font-m)',
                    fontSize: '0.8rem',
                    color: 'var(--mk-teal)',
                    letterSpacing: '0.04em',
                    margin: 0,
                  }}>
                    Desarrollo tecnológico
                  </p>
                </div>
              </div>
              <p style={{ color: 'var(--mk-muted)', fontSize: '0.9rem', lineHeight: 1.75 }}>
                Equipo de ingeniería especializado en productos de software con IA.
                Responsable de la arquitectura, desarrollo, integraciones y evolución
                continua de OPAI. Tecnología de clase mundial aplicada a problemas reales.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container">
          <div className="mk-label">
            <div className="mk-pulse" />
            Stack tecnológico
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
            Nuestra tecnología
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
            gap: '12px',
            maxWidth: '900px',
          }}>
            {techStack.map((layer) => (
              <div
                key={layer.layer}
                className="mk-card"
                style={{ padding: '20px 24px' }}
              >
                <div style={{
                  fontFamily: 'var(--mk-font-m)',
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'var(--mk-teal)',
                  marginBottom: '12px',
                }}>
                  {layer.layer}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {layer.items.map((item) => (
                    <span
                      key={item}
                      style={{
                        fontFamily: 'var(--mk-font-m)',
                        fontSize: '11px',
                        color: 'var(--mk-muted)',
                        background: 'var(--mk-teal-dim)',
                        border: '1px solid var(--mk-border)',
                        padding: '3px 8px',
                        borderRadius: '2px',
                      }}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container" style={{ textAlign: 'center' }}>
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            Misión
          </div>
          <h2
            style={{
              fontFamily: 'var(--mk-font-h)',
              fontSize: 'clamp(1.5rem, 3.5vw, 2.4rem)',
              fontWeight: 700,
              marginBottom: '20px',
              lineHeight: 1.15,
              maxWidth: '600px',
              margin: '0 auto 20px',
            }}
          >
            Llevar tecnología de clase mundial a la seguridad privada en Chile
          </h2>
          <p
            style={{
              color: 'var(--mk-muted)',
              fontSize: 'clamp(0.95rem, 1.5vw, 1.05rem)',
              lineHeight: 1.8,
              maxWidth: '600px',
              margin: '0 auto 16px',
            }}
          >
            Las empresas de seguridad privada en Chile merecen herramientas del mismo
            nivel que las grandes empresas de tecnología. Face ID, inteligencia
            artificial, GPS en tiempo real, automatizaciones — no como promesas de
            marketing, sino como funcionalidades que funcionan hoy, en producción real.
          </p>
          <p
            style={{
              color: 'var(--mk-muted)',
              fontSize: 'clamp(0.95rem, 1.5vw, 1.05rem)',
              lineHeight: 1.8,
              maxWidth: '600px',
              margin: '0 auto',
            }}
          >
            OPAI existe para que cada empresa de seguridad privada, sin importar su
            tamaño, pueda operar con la eficiencia y visibilidad que sus clientes
            demandan y su equipo merece.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container" style={{ textAlign: 'center' }}>
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            En números
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
            Lo que hemos construido
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
              gap: '20px',
            }}
          >
            {stats.map((s) => (
              <div key={s.label} className="mk-card" style={{ padding: 'clamp(20px, 3vw, 28px)' }}>
                <div
                  style={{
                    fontFamily: 'var(--mk-font-m)',
                    fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)',
                    fontWeight: 800,
                    color: 'var(--mk-teal)',
                    marginBottom: '6px',
                  }}
                >
                  {s.value}
                </div>
                <div style={{ color: 'var(--mk-muted)', fontSize: '0.82rem', lineHeight: 1.4 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <TrialBanner />
    </>
  )
}
