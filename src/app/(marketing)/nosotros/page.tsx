import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'Nosotros — Quiénes construyeron OPAI | LX3.ai',
  description:
    'OPAI fue creado por LX3.ai, liderado por Carlos Irigoyen, con más de 15 años de experiencia en seguridad privada a través de Gard Security (OS10). Construido desde la trinchera.',
  alternates: { canonical: 'https://www.opai.cl/nosotros' },
  openGraph: {
    title: 'Nosotros — Quiénes construyeron OPAI | LX3.ai',
    description:
      'La historia detrás de OPAI: 15+ años en seguridad privada, experiencia real y tecnología de clase mundial.',
    url: 'https://www.opai.cl/nosotros',
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

const timeline = [
  {
    period: 'Los inicios',
    title: 'Gard Security y la trinchera',
    text: 'Carlos Irigoyen opera Gard Security, empresa OS10 de seguridad privada por más de 15 años. Vivió en carne propia los problemas de la industria: guardias que no llegan, rondas que no se cumplen, planillas en Excel, nóminas manuales y clientes sin visibilidad.',
  },
  {
    period: 'La frustración',
    title: 'ERPs genéricos no sirven',
    text: 'Probó SAP, Odoo, sistemas hechos a medida en Chile. Ninguno entendía la seguridad privada. Todos requerían meses de customización, costaban una fortuna y al final no resolvían el problema real: la operación diaria de una empresa de guardias.',
  },
  {
    period: 'La decisión',
    title: 'Construirlo desde cero',
    text: 'Si ningún software entiende la seguridad privada, hay que construir uno que sí lo haga. Nace LX3.ai con una misión: crear el ERP que toda empresa de seguridad privada necesita pero que no existía.',
  },
  {
    period: 'Hoy',
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
                <div
                  style={{
                    fontFamily: 'var(--mk-font-m)',
                    fontSize: '0.75rem',
                    color: 'var(--mk-teal)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    marginBottom: '8px',
                  }}
                >
                  {t.period}
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
            <div className="mk-card" style={{ padding: 'clamp(28px, 3vw, 36px)' }}>
              <h3
                style={{
                  fontFamily: 'var(--mk-font-h)',
                  fontSize: '1.2rem',
                  fontWeight: 700,
                  marginBottom: '4px',
                }}
              >
                Carlos Irigoyen
              </h3>
              <p
                style={{
                  fontFamily: 'var(--mk-font-m)',
                  fontSize: '0.8rem',
                  color: 'var(--mk-teal)',
                  marginBottom: '16px',
                  letterSpacing: '0.04em',
                }}
              >
                Fundador
              </p>
              <p style={{ color: 'var(--mk-muted)', fontSize: '0.9rem', lineHeight: 1.75 }}>
                Más de 15 años en la industria de seguridad privada como operador de
                Gard Security (OS10). Conoce cada dolor de la industria porque los vivió.
                Decidió que el software que necesitaba no existía y lo construyó.
              </p>
            </div>
            <div className="mk-card" style={{ padding: 'clamp(28px, 3vw, 36px)' }}>
              <h3
                style={{
                  fontFamily: 'var(--mk-font-h)',
                  fontSize: '1.2rem',
                  fontWeight: 700,
                  marginBottom: '4px',
                }}
              >
                LX3.ai
              </h3>
              <p
                style={{
                  fontFamily: 'var(--mk-font-m)',
                  fontSize: '0.8rem',
                  color: 'var(--mk-teal)',
                  marginBottom: '16px',
                  letterSpacing: '0.04em',
                }}
              >
                Desarrollo tecnológico
              </p>
              <p style={{ color: 'var(--mk-muted)', fontSize: '0.9rem', lineHeight: 1.75 }}>
                Equipo de ingeniería especializado en productos de software con IA.
                Responsable de la arquitectura, desarrollo, integraciones y evolución
                continua de OPAI. Tecnología de clase mundial aplicada a problemas reales.
              </p>
            </div>
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
