import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'Funcionalidades — Sistema completo para seguridad privada',
  description:
    'Conoce todas las funcionalidades de OPAI: operaciones, rondas GPS, Face ID, alertas WhatsApp, IA operacional, CRM, finanzas y 6 portales especializados para empresas de seguridad privada.',
  alternates: {
    canonical: 'https://www.opai.cl/funcionalidades',
  },
}

const modules = [
  {
    href: '/funcionalidades/operaciones',
    label: 'Operaciones',
    icon: '🛡',
    description: 'Gestión de guardias, turnos, asignaciones y check-ins con GPS, QR, PIN y Face ID.',
  },
  {
    href: '/funcionalidades/rondas-gps',
    label: 'Rondas GPS',
    icon: '📍',
    description: 'Checkpoints inteligentes con Trust Score 0-100 y detección de anomalías en tiempo real.',
  },
  {
    href: '/funcionalidades/face-id',
    label: 'Face ID',
    icon: '🔐',
    description: 'Marcaciones biométricas con AWS Rekognition, liveness detection y cumplimiento Res N°38.',
  },
  {
    href: '/funcionalidades/alertas-cobertura',
    label: 'Alertas Cobertura',
    icon: '📲',
    description: 'Alertas WhatsApp automáticas por oleadas para que ningún puesto quede sin guardia.',
  },
  {
    href: '/funcionalidades/ats',
    label: 'ATS — Reclutamiento',
    icon: '🎯',
    description: 'Publica empleos en Google, Indeed y más. Match score inteligente. La mayor base de guardias de Chile.',
  },
  {
    href: '/funcionalidades/ia-operacional',
    label: 'IA Operacional',
    icon: '🤖',
    description: 'RAG con pgvector, OCR inteligente, análisis nocturno y detección de frustración.',
  },
  {
    href: '/funcionalidades/crm-comercial',
    label: 'CRM Comercial',
    icon: '💼',
    description: 'Pipeline de ventas, cotizaciones PDF, propuestas interactivas y seguimiento con IA.',
  },
  {
    href: '/funcionalidades/finanzas',
    label: 'Finanzas',
    icon: '📊',
    description: 'Contabilidad partida doble, DTE electrónico, conciliación bancaria y factoring.',
  },
  {
    href: '/funcionalidades/portales',
    label: 'Portales',
    icon: '🚪',
    description: '6 portales independientes para admin, cliente, guardia, supervisor, marcación y rondas.',
  },
]

export default function FuncionalidadesPage() {
  return (
    <>
      {/* Hero */}
      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="mk-container">
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            Plataforma completa
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
            Todo lo que necesita tu empresa de seguridad — en un solo sistema
          </h1>
          <p style={{
            color: 'var(--mk-muted)',
            fontSize: 'clamp(1rem, 2vw, 1.15rem)',
            lineHeight: 1.75,
            maxWidth: '600px',
            margin: '0 auto',
          }}>
            259 modelos de datos, 801 endpoints, 6 portales, 18 cron jobs y la única IA operacional
            real del mercado. Desde la gestión diaria de guardias hasta la facturación electrónica.
          </p>
        </div>
      </section>

      {/* Module grid */}
      <section style={{ paddingBottom: 'var(--mk-section)' }}>
        <div className="mk-container">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
            gap: 'clamp(16px, 2vw, 24px)',
          }}>
            {modules.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="mk-card"
                style={{
                  padding: 'clamp(24px, 3vw, 36px)',
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <span style={{ fontSize: '1.8rem' }}>{m.icon}</span>
                <h2 style={{
                  fontFamily: 'var(--mk-font-h)',
                  fontSize: 'clamp(1.1rem, 2vw, 1.3rem)',
                  fontWeight: 700,
                  color: 'var(--mk-text)',
                  margin: 0,
                }}>
                  {m.label}
                </h2>
                <p style={{
                  color: 'var(--mk-muted)',
                  fontSize: '0.9rem',
                  lineHeight: 1.7,
                  margin: 0,
                }}>
                  {m.description}
                </p>
                <span style={{
                  fontFamily: 'var(--mk-font-m)',
                  fontSize: '0.8rem',
                  color: 'var(--mk-teal)',
                  marginTop: 'auto',
                }}>
                  Ver detalle →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <TrialBanner />
    </>
  )
}
