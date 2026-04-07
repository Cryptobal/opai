import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'CRM para Empresas de Seguridad',
  description:
    'CRM diseñado para vender servicios de seguridad privada: pipeline visual, cotizaciones PDF con Playwright, propuestas interactivas, seguimiento automático y enriquecimiento con IA.',
  alternates: {
    canonical: 'https://www.opai.cl/funcionalidades/crm-comercial',
  },
  openGraph: {
    title: 'CRM para Empresas de Seguridad | OPAI',
    description:
      'CRM diseñado para vender servicios de seguridad privada: pipeline visual, cotizaciones PDF, propuestas interactivas y enriquecimiento con IA.',
    url: 'https://www.opai.cl/funcionalidades/crm-comercial',
    type: 'website',
    images: [{ url: '/icons/og-image.png', width: 1200, height: 630, alt: 'OPAI — ERP con IA para Seguridad Privada' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CRM para Empresas de Seguridad | OPAI',
    description: 'Pipeline visual, cotizaciones PDF, propuestas interactivas y enriquecimiento con IA.',
    images: ['/icons/og-image.png'],
  },
}

const features = [
  {
    title: 'Pipeline visual de ventas',
    description:
      'Tablero kanban con las etapas de tu ciclo comercial. Arrastra oportunidades entre columnas, filtra por monto, fecha o vendedor y visualiza el forecast en tiempo real.',
  },
  {
    title: 'Cotizaciones PDF profesionales',
    description:
      'Genera cotizaciones en PDF con el detalle de servicios, valores por turno, condiciones y tu marca. Renderizadas con Playwright para un resultado pixel-perfect.',
  },
  {
    title: 'Propuestas interactivas',
    description:
      'Envía al prospecto un enlace con la propuesta completa: servicios, precios, simulador de turnos y botón de aceptación digital. Todo trackeable.',
  },
  {
    title: 'Seguimiento automático',
    description:
      'Recordatorios automáticos por email y WhatsApp cuando una cotización lleva días sin respuesta. Secuencias configurables por etapa del pipeline.',
  },
  {
    title: 'Enriquecimiento de leads con IA',
    description:
      'La IA busca datos públicos del lead (SII, prensa, LinkedIn) y prepara un brief antes de la reunión: tamaño estimado de operación, competencia actual y puntos de dolor.',
  },
  {
    title: 'Métricas comerciales',
    description:
      'Tasa de conversión por etapa, tiempo promedio de cierre, ticket promedio, forecast mensual y performance por vendedor. Datos reales, no suposiciones.',
  },
]

export default function CrmComercialPage() {
  return (
    <>
      {/* Hero */}
      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="mk-container">
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            CRM comercial
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
            CRM diseñado para vender servicios de seguridad
          </h1>
          <p style={{
            color: 'var(--mk-muted)',
            fontSize: 'clamp(1rem, 2vw, 1.15rem)',
            lineHeight: 1.75,
            maxWidth: '600px',
            margin: '0 auto 40px',
          }}>
            Un CRM genérico no entiende turnos, puestos ni tarifas por hora. OPAI sí.
            Pipeline, cotizaciones y propuestas pensadas para el negocio de seguridad privada.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <Link href="/registrarse" className="mk-btn-primary">
              Probar gratis →
            </Link>
            <Link href="/funcionalidades" className="mk-btn-ghost">
              ← Todas las funcionalidades
            </Link>
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
