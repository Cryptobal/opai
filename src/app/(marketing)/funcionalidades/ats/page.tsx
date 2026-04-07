import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'ATS — Sistema de Reclutamiento para Guardias de Seguridad',
  description:
    'Publica empleos en Google, Indeed, Computrabajo y más. Gestiona candidatos con match score inteligente. La mayor base de guardias de Chile.',
  alternates: {
    canonical: 'https://www.opai.cl/funcionalidades/ats',
  },
  openGraph: {
    title: 'ATS — Sistema de Reclutamiento para Guardias de Seguridad | OPAI',
    description:
      'Publica empleos en Google, Indeed, Computrabajo y más. Gestiona candidatos con match score inteligente. La mayor base de guardias de Chile.',
    url: 'https://www.opai.cl/funcionalidades/ats',
    type: 'website',
    images: [{ url: '/icons/og-image.png', width: 1200, height: 630, alt: 'OPAI — ERP con IA para Seguridad Privada' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ATS — Sistema de Reclutamiento para Guardias | OPAI',
    description: 'Publica empleos en Google, Indeed, Computrabajo y más. Match score inteligente.',
    images: ['/icons/og-image.png'],
  },
}

const features = [
  {
    title: 'Publicación multicanal',
    description:
      'Un clic, todos los portales: Google Empleos, Indeed, Computrabajo, Bumeran y más. Publica una vez y llega a miles de candidatos sin esfuerzo duplicado.',
  },
  {
    title: 'Match score configurable',
    description:
      'Cada empresa define qué pesa más: OS10, cercanía geográfica, experiencia o pretensión de renta. El sistema calcula un score 0-100 para cada candidato.',
  },
  {
    title: 'Pipeline visual',
    description:
      'Kanban desde postulado hasta contratado, con historial y notas por candidato. Arrastra y suelta para mover candidatos entre etapas del proceso.',
  },
  {
    title: 'Base de guardias Opai',
    description:
      'Notifica en tiempo real a guardias calificados ya inscritos en la plataforma. Sin publicar en portales externos, encuentra talento en tu propia base.',
  },
  {
    title: 'Portal del guardia postulante',
    description:
      'Los guardias se registran con Google, completan su perfil y reciben ofertas personalizadas con push notifications. Experiencia mobile-first.',
  },
  {
    title: 'Conexión con turnos extra',
    description:
      'Un guardia postulante puede aceptar turnos urgentes antes de ser contratado full-time. La conexión entre reclutamiento y operaciones es automática.',
  },
]

export default function AtsMarketingPage() {
  return (
    <>
      {/* Hero */}
      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="mk-container">
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            ATS — Reclutamiento
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
            Recluta guardias con inteligencia — no con planillas Excel
          </h1>
          <p style={{
            color: 'var(--mk-muted)',
            fontSize: 'clamp(1rem, 2vw, 1.15rem)',
            lineHeight: 1.75,
            maxWidth: '600px',
            margin: '0 auto 40px',
          }}>
            Publica en todos los portales de empleo con un clic.
            Match score inteligente conecta tu aviso con los guardias que realmente calzan.
            Del postulado al contratado en una sola plataforma.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <Link href="/registrarse" className="mk-btn-primary">
              Probar gratis
            </Link>
            <Link href="/funcionalidades" className="mk-btn-secondary">
              Ver todos los módulos
            </Link>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="mk-section">
        <div className="mk-container">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '32px',
          }}>
            {features.map((f) => (
              <article
                key={f.title}
                style={{
                  background: 'var(--mk-card)',
                  borderRadius: '16px',
                  padding: '32px',
                  border: '1px solid var(--mk-border)',
                }}
              >
                <h3 style={{
                  fontFamily: 'var(--mk-font-h)',
                  fontSize: '1.15rem',
                  fontWeight: 700,
                  color: 'var(--mk-text)',
                  marginBottom: '12px',
                }}>
                  {f.title}
                </h3>
                <p style={{
                  color: 'var(--mk-muted)',
                  fontSize: '0.95rem',
                  lineHeight: 1.75,
                }}>
                  {f.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <TrialBanner />
    </>
  )
}
