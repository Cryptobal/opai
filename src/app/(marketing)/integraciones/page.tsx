import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'Integraciones | OPAI — Ecosistema Tecnológico',
  description:
    'OPAI integra AWS Rekognition, Twilio WhatsApp, OpenAI, Anthropic Claude, Pusher, Cloudflare R2, Resend, Leaflet, pgvector, Playwright, Capacitor y Sentry para un ERP de seguridad privada de clase mundial.',
  alternates: { canonical: 'https://www.opai.cl/integraciones' },
  openGraph: {
    title: 'Integraciones | OPAI — Ecosistema Tecnológico',
    description:
      '12 integraciones de clase mundial que potencian el ERP de seguridad privada más completo de Chile.',
    url: 'https://www.opai.cl/integraciones',
    type: 'website',
    images: [{ url: '/icons/og-image.png', width: 1200, height: 630, alt: 'OPAI — ERP con IA para Seguridad Privada' }],
  },
}

const integrations = [
  {
    name: 'AWS Rekognition',
    category: 'Biometría',
    description: 'Reconocimiento facial con machine learning de Amazon para verificación de identidad.',
    useCase: 'Face ID para marcaciones de guardias con 95% de confianza. Sin contacto, sin fraude.',
    color: 'var(--mk-orange)',
  },
  {
    name: 'Twilio',
    category: 'Comunicación',
    description: 'Plataforma de comunicaciones cloud para mensajería programática por WhatsApp.',
    useCase: 'Alertas de cobertura en olas por WhatsApp: supervisor, jefe de operaciones y cliente.',
    color: 'var(--mk-teal)',
  },
  {
    name: 'OpenAI',
    category: 'Inteligencia Artificial',
    description: 'Motor de IA gpt-4o para procesamiento de lenguaje natural y análisis avanzado.',
    useCase: 'Help chat RAG, OCR de documentos, detección de frustración, análisis de anomalías en rondas.',
    color: 'var(--mk-teal)',
  },
  {
    name: 'Anthropic',
    category: 'IA Fallback',
    description: 'Claude como modelo de respaldo para garantizar disponibilidad continua de IA.',
    useCase: 'Fallback automático cuando OpenAI no está disponible. Garantiza uptime de funcionalidades IA.',
    color: 'var(--mk-orange)',
  },
  {
    name: 'Pusher',
    category: 'Tiempo Real',
    description: 'WebSockets gestionados para comunicación bidireccional en tiempo real.',
    useCase: 'Actualización en vivo de posiciones GPS, alertas de rondas, notificaciones y chat interno.',
    color: 'var(--mk-teal)',
  },
  {
    name: 'Cloudflare R2',
    category: 'Almacenamiento',
    description: 'Almacenamiento de objetos compatible con S3, sin costos de egress.',
    useCase: 'Fotos de marcaciones, documentos de guardias, reportes PDF, archivos de clientes.',
    color: 'var(--mk-orange)',
  },
  {
    name: 'Resend',
    category: 'Email',
    description: 'API moderna de email transaccional con alta entregabilidad.',
    useCase: 'Notificaciones por email, reportes automáticos, invitaciones a portales y confirmaciones.',
    color: 'var(--mk-teal)',
  },
  {
    name: 'Leaflet',
    category: 'Mapas',
    description: 'Biblioteca open-source de mapas interactivos con soporte para capas y polígonos.',
    useCase: 'Visualización de rondas GPS, geo-fence de instalaciones, ubicación de guardias en tiempo real.',
    color: 'var(--mk-orange)',
  },
  {
    name: 'pgvector',
    category: 'RAG',
    description: 'Extensión PostgreSQL para almacenamiento y búsqueda de vectores de embeddings.',
    useCase: 'Búsqueda semántica para el help chat RAG. Encuentra información relevante en manuales y procedimientos.',
    color: 'var(--mk-teal)',
  },
  {
    name: 'Playwright',
    category: 'PDF',
    description: 'Framework de automatización de navegador para generación de documentos.',
    useCase: 'Generación de reportes PDF: informes de rondas, reportes financieros, contratos y cotizaciones.',
    color: 'var(--mk-orange)',
  },
  {
    name: 'Capacitor',
    category: 'Móvil',
    description: 'Runtime nativo para ejecutar aplicaciones web en iOS y Android.',
    useCase: 'App móvil nativa para guardias: marcaciones Face ID, registro de rondas GPS, notificaciones push.',
    color: 'var(--mk-teal)',
  },
  {
    name: 'Sentry',
    category: 'Monitoreo',
    description: 'Plataforma de monitoreo de errores y performance en producción.',
    useCase: 'Detección proactiva de errores, tracking de performance y alertas de degradación del servicio.',
    color: 'var(--mk-orange)',
  },
]

export default function IntegracionesPage() {
  return (
    <>
      {/* Hero */}
      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="mk-container">
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            Ecosistema tecnológico
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
            Integraciones de clase mundial
          </h1>
          <p
            style={{
              color: 'var(--mk-muted)',
              fontSize: 'clamp(1rem, 2vw, 1.15rem)',
              lineHeight: 1.75,
              maxWidth: '620px',
              margin: '0 auto 20px',
            }}
          >
            OPAI conecta 12 tecnologías líderes para ofrecer un ERP de seguridad
            privada sin compromisos: reconocimiento facial, IA, comunicaciones,
            mapas, almacenamiento y monitoreo.
          </p>
          <p
            style={{
              fontFamily: 'var(--mk-font-m)',
              fontSize: '0.8rem',
              color: 'var(--mk-muted)',
              margin: '0 auto 40px',
              letterSpacing: '0.03em',
            }}
          >
            {integrations.length} integraciones &nbsp;·&nbsp; Todo incluido en tu plan
          </p>
        </div>
      </section>

      {/* Grid */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
              gap: '20px',
            }}
          >
            {integrations.map((intg) => (
              <div
                key={intg.name}
                className="mk-card"
                style={{ padding: 'clamp(24px, 3vw, 32px)', display: 'flex', flexDirection: 'column', gap: '12px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <h3
                    style={{
                      fontFamily: 'var(--mk-font-h)',
                      fontSize: '1.1rem',
                      fontWeight: 700,
                    }}
                  >
                    {intg.name}
                  </h3>
                  <span
                    style={{
                      fontFamily: 'var(--mk-font-m)',
                      fontSize: '0.7rem',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: intg.color,
                      background: intg.color === 'var(--mk-teal)' ? 'var(--mk-teal-dim)' : 'var(--mk-orange-dim)',
                      padding: '4px 10px',
                      borderRadius: '2px',
                      flexShrink: 0,
                    }}
                  >
                    {intg.category}
                  </span>
                </div>
                <p style={{ color: 'var(--mk-muted)', fontSize: '0.88rem', lineHeight: 1.65 }}>
                  {intg.description}
                </p>
                <div
                  style={{
                    borderTop: '1px solid var(--mk-border)',
                    paddingTop: '12px',
                    marginTop: 'auto',
                  }}
                >
                  <p
                    style={{
                      fontFamily: 'var(--mk-font-m)',
                      fontSize: '0.78rem',
                      color: 'var(--mk-teal)',
                      lineHeight: 1.6,
                      opacity: 0.9,
                    }}
                  >
                    <span style={{ color: 'var(--mk-muted)', fontWeight: 500 }}>En OPAI:</span>{' '}
                    {intg.useCase}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section
        className="mk-section"
        style={{ borderTop: '1px solid var(--mk-border)', textAlign: 'center' }}
      >
        <div className="mk-container">
          <h2
            style={{
              fontFamily: 'var(--mk-font-h)',
              fontSize: 'clamp(1.4rem, 3vw, 2rem)',
              fontWeight: 700,
              marginBottom: '16px',
              lineHeight: 1.2,
            }}
          >
            Todas las integraciones incluidas en tu plan
          </h2>
          <p
            style={{
              color: 'var(--mk-muted)',
              fontSize: '0.95rem',
              lineHeight: 1.75,
              maxWidth: '520px',
              margin: '0 auto 32px',
            }}
          >
            No pagas extra por ninguna integración. Face ID, WhatsApp, IA, mapas —
            todo está incluido desde el primer día.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <Link href="/registrarse" className="mk-btn-primary">
              Comenzar gratis →
            </Link>
            <Link href="/contacto" className="mk-btn-ghost">
              Hablar con ventas
            </Link>
          </div>
        </div>
      </section>

      <TrialBanner />
    </>
  )
}
