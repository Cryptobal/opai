import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: '6 Portales Especializados por Rol',
  description:
    'Cada actor tiene su propio portal: Admin, Cliente, Guardia, Supervisor, Marcación y Rondas. Autenticación independiente, permisos granulares y experiencia optimizada por rol.',
  alternates: {
    canonical: 'https://www.opai.cl/funcionalidades/portales',
  },
  openGraph: {
    title: '6 Portales Especializados por Rol | OPAI',
    description:
      'Cada actor tiene su propio portal: Admin, Cliente, Guardia, Supervisor, Marcación y Rondas. Autenticación independiente, permisos granulares y experiencia optimizada por rol.',
    url: 'https://www.opai.cl/funcionalidades/portales',
    type: 'website',
    images: [{ url: '/icons/og-image.png', width: 1200, height: 630, alt: 'OPAI — ERP con IA para Seguridad Privada' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '6 Portales Especializados por Rol | OPAI',
    description: 'Admin, Cliente, Guardia, Supervisor, Marcación y Rondas — un portal por rol.',
    images: ['/icons/og-image.png'],
  },
}

const portals = [
  {
    name: 'Portal Admin',
    audience: 'Gerencia y operaciones centrales',
    description:
      'Vista 360° del negocio: dashboard ejecutivo, gestión de contratos, configuración global, reportería avanzada y control total de la plataforma.',
    features: ['Dashboard ejecutivo', 'Gestión de contratos', 'Configuración global', 'Reportería avanzada'],
  },
  {
    name: 'Portal Cliente',
    audience: 'Empresas contratantes',
    description:
      'Tu cliente ve sus puestos, asistencia en tiempo real, informes de rondas, Trust Scores y documentación. Transparencia que fideliza.',
    features: ['Asistencia en tiempo real', 'Informes de rondas', 'Trust Score visible', 'Documentación'],
  },
  {
    name: 'Portal Guardia',
    audience: 'Guardias de seguridad',
    description:
      'El guardia consulta sus turnos, marca asistencia, revisa liquidaciones, sube documentos y recibe comunicaciones — todo desde su celular.',
    features: ['Turnos y horarios', 'Marcación de asistencia', 'Liquidaciones', 'Documentos'],
  },
  {
    name: 'Portal Supervisor',
    audience: 'Supervisores de terreno',
    description:
      'Monitoreo de guardias en terreno, validación de rondas, gestión de novedades y comunicación directa con el centro de operaciones.',
    features: ['Monitoreo en terreno', 'Validación de rondas', 'Gestión de novedades', 'Comunicación'],
  },
  {
    name: 'Portal Marcación',
    audience: 'Dispositivos de marcación fija',
    description:
      'Interfaz optimizada para tablets en recepción o garita. Marcación rápida con Face ID, QR o PIN sin necesidad de navegar menús.',
    features: ['Face ID', 'QR scan', 'PIN numérico', 'Interfaz simplificada'],
  },
  {
    name: 'Portal Rondas',
    audience: 'Guardias en rondas',
    description:
      'Interfaz móvil dedicada a rondas: checkpoints secuenciales, escaneo QR, registro GPS y captura de novedades con foto y texto.',
    features: ['Checkpoints QR', 'Registro GPS', 'Captura de novedades', 'Modo offline'],
  },
]

export default function PortalesPage() {
  return (
    <>
      {/* Hero */}
      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="mk-container">
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            6 portales
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
            Cada actor en su portal — cliente, guardia, supervisor y más
          </h1>
          <p style={{
            color: 'var(--mk-muted)',
            fontSize: 'clamp(1rem, 2vw, 1.15rem)',
            lineHeight: 1.75,
            maxWidth: '600px',
            margin: '0 auto 40px',
          }}>
            No es una app con mil menús. Son 6 portales independientes, cada uno diseñado
            para su usuario: la información justa, en el formato correcto, con autenticación propia.
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

      {/* Portals grid */}
      <section style={{ paddingBottom: 'var(--mk-section)' }}>
        <div className="mk-container">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
            gap: 'clamp(16px, 2vw, 24px)',
          }}>
            {portals.map((p) => (
              <div
                key={p.name}
                className="mk-card"
                style={{ padding: 'clamp(24px, 3vw, 36px)' }}
              >
                <span style={{
                  fontFamily: 'var(--mk-font-m)',
                  fontSize: '0.7rem',
                  color: 'var(--mk-teal)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: '8px',
                }}>
                  {p.audience}
                </span>
                <h3 style={{
                  fontFamily: 'var(--mk-font-h)',
                  fontSize: 'clamp(1.1rem, 2vw, 1.3rem)',
                  fontWeight: 700,
                  color: 'var(--mk-text)',
                  marginBottom: '12px',
                }}>
                  {p.name}
                </h3>
                <p style={{
                  color: 'var(--mk-muted)',
                  fontSize: '0.9rem',
                  lineHeight: 1.75,
                  marginBottom: '16px',
                }}>
                  {p.description}
                </p>
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}>
                  {p.features.map((feat) => (
                    <span
                      key={feat}
                      style={{
                        fontFamily: 'var(--mk-font-m)',
                        fontSize: '0.7rem',
                        color: 'var(--mk-muted)',
                        background: 'var(--mk-teal-dim)',
                        border: '1px solid var(--mk-border)',
                        borderRadius: '2px',
                        padding: '4px 10px',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {feat}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Independent auth callout */}
      <section style={{ paddingBottom: 'var(--mk-section)' }}>
        <div className="mk-container">
          <div className="mk-card" style={{
            padding: 'clamp(32px, 4vw, 56px)',
            textAlign: 'center',
            borderColor: 'var(--mk-teal-mid)',
            background: 'linear-gradient(180deg, var(--mk-teal-dim) 0%, var(--mk-bg-card) 100%)',
          }}>
            <h2 style={{
              fontFamily: 'var(--mk-font-h)',
              fontSize: 'clamp(1.2rem, 3vw, 1.6rem)',
              fontWeight: 700,
              color: 'var(--mk-text)',
              marginBottom: '16px',
            }}>
              Autenticación independiente por portal
            </h2>
            <p style={{
              color: 'var(--mk-muted)',
              fontSize: '0.95rem',
              lineHeight: 1.75,
              maxWidth: '560px',
              margin: '0 auto',
            }}>
              Cada portal tiene su propio flujo de autenticación, permisos y sesión.
              El guardia no ve datos del cliente. El cliente no ve datos financieros.
              El supervisor ve solo lo que necesita para operar en terreno.
              Seguridad de la información por diseño.
            </p>
          </div>
        </div>
      </section>

      <TrialBanner />
    </>
  )
}
