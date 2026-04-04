import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'Control de Rondas GPS para Seguridad Privada | OPAI',
  description:
    'Sistema de control de rondas GPS con checkpoints, geo-fence, Trust Score 0-100 y detección de anomalías por IA para empresas de seguridad privada en Chile.',
  alternates: { canonical: 'https://www.opai.cl/control-rondas-gps' },
  openGraph: {
    title: 'Control de Rondas GPS para Seguridad Privada | OPAI',
    description:
      'Monitorea rondas en tiempo real con GPS, checkpoints inteligentes y Trust Score impulsado por inteligencia artificial.',
    url: 'https://www.opai.cl/control-rondas-gps',
  },
}

const features = [
  {
    icon: '📍',
    title: 'Checkpoints Inteligentes',
    description:
      'Define puntos de control en cada instalación. El guardia los registra desde la app móvil con geolocalización automática. Si no llega al punto, el sistema lo detecta.',
    detail: 'Configuración flexible: radio de validación, horarios, frecuencia y orden de visita.',
  },
  {
    icon: '🔲',
    title: 'Geo-fence por Instalación',
    description:
      'Delimita el perímetro exacto de cada sitio. OPAI detecta automáticamente cuando un guardia entra o sale del área asignada y genera alertas en tiempo real.',
    detail: 'Polígonos personalizables con Leaflet. Soporte para múltiples zonas por instalación.',
  },
  {
    icon: '🎯',
    title: 'Trust Score 0-100',
    description:
      'Cada ronda recibe un puntaje de confianza calculado por IA. El Trust Score evalúa puntualidad, cobertura de checkpoints, velocidad de desplazamiento y patrones históricos.',
    detail: 'Score bajo 60 genera alerta automática. Score bajo 30 escala a supervisores.',
  },
  {
    icon: '📡',
    title: 'Monitoreo en Tiempo Real',
    description:
      'Visualiza la ubicación de todos tus guardias en un mapa interactivo Leaflet. Filtros por instalación, turno, estado de ronda y Trust Score.',
    detail: 'Actualización en tiempo real con Pusher. Sin necesidad de recargar la página.',
  },
  {
    icon: '🤖',
    title: 'Análisis IA de Anomalías',
    description:
      'La inteligencia artificial de OPAI (gpt-4o + Claude) analiza patrones de rondas y detecta comportamientos anómalos: rutas repetitivas, tiempos sospechosos o zonas no cubiertas.',
    detail: 'Reportes semanales automáticos con recomendaciones de mejora operacional.',
  },
  {
    icon: '💬',
    title: 'Alertas WhatsApp Automáticas',
    description:
      'Cuando una ronda no se cumple o el Trust Score baja, OPAI envía alertas automáticas por WhatsApp al supervisor y al cliente vía Twilio, en olas escalonadas.',
    detail: 'Ola 1: supervisor. Ola 2: jefe de operaciones. Ola 3: cliente. Configurable.',
  },
]

const metrics = [
  { value: '0-100', label: 'Trust Score por ronda' },
  { value: 'GPS', label: 'Tracking en tiempo real' },
  { value: 'IA', label: 'Detección de anomalías' },
  { value: '24/7', label: 'Monitoreo automatizado' },
]

export default function ControlRondasGPSPage() {
  return (
    <>
      {/* Hero */}
      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="mk-container">
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            Rondas GPS
          </div>
          <h1
            style={{
              fontFamily: 'var(--mk-font-h)',
              fontSize: 'clamp(2rem, 5vw, 3.4rem)',
              fontWeight: 800,
              lineHeight: 1.1,
              maxWidth: '800px',
              margin: '0 auto 24px',
            }}
          >
            Control de Rondas GPS para Empresas de Seguridad Privada
          </h1>
          <p
            style={{
              color: 'var(--mk-muted)',
              fontSize: 'clamp(1rem, 2vw, 1.15rem)',
              lineHeight: 1.75,
              maxWidth: '640px',
              margin: '0 auto 40px',
            }}
          >
            Monitorea cada ronda en tiempo real con GPS, checkpoints inteligentes,
            geo-fence y un Trust Score de 0-100 calculado por inteligencia artificial.
            Sabe exactamente qué pasa en cada instalación, en todo momento.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <Link href="/registrarse" className="mk-btn-primary">
              Probar gratis 30 días →
            </Link>
            <Link href="/contacto" className="mk-btn-ghost">
              Solicitar demo
            </Link>
          </div>
        </div>
      </section>

      {/* Metrics */}
      <section style={{ borderTop: '1px solid var(--mk-border)', padding: 'clamp(40px, 6vw, 64px) 0' }}>
        <div className="mk-container">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
              gap: '20px',
              textAlign: 'center',
            }}
          >
            {metrics.map((m) => (
              <div key={m.label} className="mk-card" style={{ padding: 'clamp(20px, 3vw, 28px)' }}>
                <div
                  style={{
                    fontFamily: 'var(--mk-font-m)',
                    fontSize: 'clamp(1.5rem, 3vw, 2rem)',
                    fontWeight: 800,
                    color: 'var(--mk-teal)',
                    marginBottom: '6px',
                  }}
                >
                  {m.value}
                </div>
                <div style={{ color: 'var(--mk-muted)', fontSize: '0.85rem' }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container">
          <div className="mk-label">
            <div className="mk-pulse" />
            Funcionalidades
          </div>
          <h2
            style={{
              fontFamily: 'var(--mk-font-h)',
              fontSize: 'clamp(1.5rem, 3.5vw, 2.4rem)',
              fontWeight: 700,
              marginBottom: '48px',
              lineHeight: 1.15,
              maxWidth: '600px',
            }}
          >
            Control total de cada ronda, cada checkpoint, cada guardia
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '760px' }}>
            {features.map((f) => (
              <div key={f.title} className="mk-card" style={{ padding: 'clamp(24px, 3vw, 36px)' }}>
                <div style={{ fontSize: '1.6rem', marginBottom: '14px' }}>{f.icon}</div>
                <h3
                  style={{
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    marginBottom: '10px',
                  }}
                >
                  {f.title}
                </h3>
                <p style={{ color: 'var(--mk-muted)', fontSize: '0.92rem', lineHeight: 1.75, marginBottom: '12px' }}>
                  {f.description}
                </p>
                <p
                  style={{
                    fontFamily: 'var(--mk-font-m)',
                    fontSize: '0.8rem',
                    color: 'var(--mk-teal)',
                    opacity: 0.8,
                    lineHeight: 1.6,
                  }}
                >
                  {f.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container">
          <div className="mk-label">
            <div className="mk-pulse" />
            Flujo operativo
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
            Cómo funciona el control de rondas
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
              gap: '24px',
            }}
          >
            {[
              {
                step: '01',
                title: 'Configura checkpoints',
                text: 'Define los puntos de control y el geo-fence de cada instalación desde el panel de operaciones.',
              },
              {
                step: '02',
                title: 'El guardia ejecuta la ronda',
                text: 'Desde la app móvil, el guardia registra cada checkpoint con GPS automático. Sin intervención manual.',
              },
              {
                step: '03',
                title: 'La IA calcula el Trust Score',
                text: 'OPAI analiza la ronda en tiempo real: puntualidad, cobertura, velocidad y patrones. Asigna un score de 0 a 100.',
              },
              {
                step: '04',
                title: 'Alertas automáticas',
                text: 'Si algo no cuadra, el sistema envía alertas WhatsApp en olas al supervisor, jefe de operaciones y cliente.',
              },
            ].map((s) => (
              <div key={s.step} className="mk-card" style={{ padding: 'clamp(24px, 3vw, 32px)' }}>
                <div
                  style={{
                    fontFamily: 'var(--mk-font-m)',
                    fontSize: '0.75rem',
                    color: 'var(--mk-teal)',
                    letterSpacing: '0.1em',
                    marginBottom: '14px',
                  }}
                >
                  PASO {s.step}
                </div>
                <h3
                  style={{
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    marginBottom: '10px',
                  }}
                >
                  {s.title}
                </h3>
                <p style={{ color: 'var(--mk-muted)', fontSize: '0.88rem', lineHeight: 1.7 }}>
                  {s.text}
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
