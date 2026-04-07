import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'Alertas de Cobertura Automáticas WhatsApp',
  description:
    'Sistema de alertas WhatsApp por oleadas para cubrir ausencias de guardias automáticamente. Tracking de aceptación, escalamiento y asignación de cobertura.',
  alternates: {
    canonical: 'https://www.opai.cl/funcionalidades/alertas-cobertura',
  },
  openGraph: {
    title: 'Alertas de Cobertura Automáticas WhatsApp | OPAI',
    description:
      'Sistema de alertas WhatsApp por oleadas para cubrir ausencias de guardias automáticamente. Tracking de aceptación, escalamiento y asignación de cobertura.',
    url: 'https://www.opai.cl/funcionalidades/alertas-cobertura',
    type: 'website',
    images: [{ url: '/icons/og-image.png', width: 1200, height: 630, alt: 'OPAI — ERP con IA para Seguridad Privada' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Alertas de Cobertura Automáticas WhatsApp | OPAI',
    description: 'Sistema de alertas WhatsApp por oleadas para cubrir ausencias de guardias automáticamente.',
    images: ['/icons/og-image.png'],
  },
}

const features = [
  {
    title: 'Alertas por oleadas',
    description:
      'Cuando un guardia no se presenta, OPAI envía alertas WhatsApp escalonadas: primero al pool cercano, luego al extendido. Cada oleada espera un tiempo configurable antes de escalar.',
  },
  {
    title: 'Pool de guardias disponibles',
    description:
      'El sistema conoce la disponibilidad, ubicación, certificaciones y preferencias de cada guardia. Solo contacta a quienes realmente pueden cubrir el turno.',
  },
  {
    title: 'Tracking de aceptación',
    description:
      'Cada guardia recibe un mensaje con los detalles del turno y puede aceptar o rechazar directamente desde WhatsApp. El sistema registra respuestas en tiempo real.',
  },
  {
    title: 'Escalamiento automático',
    description:
      'Si la primera oleada no consigue cobertura en el tiempo definido, el sistema escala automáticamente: amplía el pool, notifica al supervisor y registra el incidente.',
  },
  {
    title: 'Asignación automática de cobertura',
    description:
      'Al recibir la primera aceptación, el guardia queda asignado automáticamente. El sistema actualiza turnos, notifica al cliente y cierra las alertas pendientes.',
  },
  {
    title: 'Historial y métricas de cobertura',
    description:
      'Reportes de tiempo promedio de cobertura, tasa de respuesta por guardia, oleadas necesarias y puestos con mayor rotación. Datos para mejorar la planificación.',
  },
]

export default function AlertasCoberturaPage() {
  return (
    <>
      {/* Hero */}
      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="mk-container">
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            Alertas de cobertura
          </div>
          <h1 style={{
            fontFamily: 'var(--mk-font-h)',
            fontSize: 'clamp(2rem, 5vw, 3.2rem)',
            fontWeight: 800,
            lineHeight: 1.1,
            color: 'var(--mk-text)',
            maxWidth: '720px',
            margin: '0 auto 24px',
          }}>
            Ningún puesto queda sin guardia — alertas WhatsApp automáticas
          </h1>
          <p style={{
            color: 'var(--mk-muted)',
            fontSize: 'clamp(1rem, 2vw, 1.15rem)',
            lineHeight: 1.75,
            maxWidth: '600px',
            margin: '0 auto 40px',
          }}>
            Olvídate de las llamadas a las 5 AM buscando reemplazos. OPAI detecta la ausencia,
            contacta al pool disponible por WhatsApp y asigna cobertura sin intervención humana.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <Link href="/registrarse" className="mk-btn-primary">
              Probar gratis 30 días →
            </Link>
            <Link href="/funcionalidades" className="mk-btn-ghost">
              ← Todas las funcionalidades
            </Link>
          </div>
        </div>
      </section>

      {/* Flow visualization */}
      <section style={{ paddingBottom: 'clamp(40px, 6vw, 80px)' }}>
        <div className="mk-container">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
            gap: '16px',
            textAlign: 'center',
          }}>
            {[
              { step: '01', label: 'Ausencia detectada', detail: 'Check-in no registrado' },
              { step: '02', label: 'Oleada 1 enviada', detail: 'Pool cercano por WhatsApp' },
              { step: '03', label: 'Guardia acepta', detail: 'Respuesta directa en chat' },
              { step: '04', label: 'Cobertura asignada', detail: 'Turno actualizado al instante' },
            ].map((s) => (
              <div key={s.step} className="mk-card" style={{ padding: 'clamp(20px, 3vw, 32px)' }}>
                <span style={{
                  fontFamily: 'var(--mk-font-m)',
                  fontSize: '0.75rem',
                  color: 'var(--mk-teal)',
                  letterSpacing: '0.1em',
                }}>
                  PASO {s.step}
                </span>
                <h3 style={{
                  fontFamily: 'var(--mk-font-h)',
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  color: 'var(--mk-text)',
                  margin: '8px 0 6px',
                }}>
                  {s.label}
                </h3>
                <p style={{ color: 'var(--mk-muted)', fontSize: '0.85rem', margin: 0 }}>
                  {s.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ paddingBottom: 'var(--mk-section)' }}>
        <div className="mk-container">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
            gap: 'clamp(16px, 2vw, 24px)',
          }}>
            {features.map((f) => (
              <div
                key={f.title}
                className="mk-card"
                style={{ padding: 'clamp(24px, 3vw, 36px)' }}
              >
                <h3 style={{
                  fontFamily: 'var(--mk-font-h)',
                  fontSize: 'clamp(1.05rem, 2vw, 1.2rem)',
                  fontWeight: 700,
                  color: 'var(--mk-text)',
                  marginBottom: '12px',
                }}>
                  {f.title}
                </h3>
                <p style={{
                  color: 'var(--mk-muted)',
                  fontSize: '0.9rem',
                  lineHeight: 1.75,
                  margin: 0,
                }}>
                  {f.description}
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
