import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'Face ID Biométrico para Guardias',
  description:
    'Marcaciones biométricas con AWS Rekognition, threshold del 95%, quality checks, liveness detection y cumplimiento automático de Resolución N°38.',
  alternates: {
    canonical: 'https://www.opai.cl/funcionalidades/face-id',
  },
  openGraph: {
    title: 'Face ID Biométrico para Guardias | OPAI',
    description:
      'Marcaciones biométricas con AWS Rekognition, threshold del 95%, quality checks, liveness detection y cumplimiento automático de Resolución N°38.',
    url: 'https://www.opai.cl/funcionalidades/face-id',
    type: 'website',
    images: [{ url: '/icons/og-image.png', width: 1200, height: 630, alt: 'OPAI — ERP con IA para Seguridad Privada' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Face ID Biométrico para Guardias | OPAI',
    description: 'AWS Rekognition al 95%, liveness detection y cumplimiento Res N°38.',
    images: ['/icons/og-image.png'],
  },
}

const features = [
  {
    title: 'AWS Rekognition — 95% threshold',
    description:
      'Usamos AWS Rekognition con un umbral de confianza del 95%. Solo se confirma la identidad cuando el match supera ese nivel, eliminando falsos positivos.',
  },
  {
    title: 'Quality checks automáticos',
    description:
      'Antes de comparar, el sistema verifica iluminación, enfoque, ángulo del rostro y oclusiones. Si la foto no cumple estándares, pide al guardia que la repita.',
  },
  {
    title: 'Liveness detection',
    description:
      'Detección de vida para evitar suplantación con fotos impresas o pantallas. El guardia debe estar físicamente presente — no se aceptan trucos.',
  },
  {
    title: 'Cumplimiento Resolución N°38',
    description:
      'El tratamiento de datos biométricos cumple con la Resolución N°38 del Consejo para la Transparencia. Consentimiento explícito, finalidad acotada y acceso controlado.',
  },
  {
    title: 'Destrucción automática de datos',
    description:
      'Las imágenes biométricas se eliminan automáticamente según la política configurada. No se almacenan fotos innecesarias — solo los vectores faciales encriptados.',
  },
]

export default function FaceIdPage() {
  return (
    <>
      {/* Hero */}
      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="mk-container">
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            Face ID
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
            Marcaciones biométricas con Face ID — no solo GPS
          </h1>
          <p style={{
            color: 'var(--mk-muted)',
            fontSize: 'clamp(1rem, 2vw, 1.15rem)',
            lineHeight: 1.75,
            maxWidth: '600px',
            margin: '0 auto 40px',
          }}>
            El GPS dice dónde está el celular. Face ID confirma quién está frente a él.
            Identidad verificada con AWS Rekognition y cumplimiento normativo integrado.
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

      {/* Compliance callout */}
      <section style={{ paddingBottom: 'var(--mk-section)' }}>
        <div className="mk-container">
          <div className="mk-card" style={{
            padding: 'clamp(32px, 4vw, 56px)',
            borderColor: 'var(--mk-teal-mid)',
            background: 'linear-gradient(180deg, var(--mk-teal-dim) 0%, var(--mk-bg-card) 100%)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
            gap: '32px',
            textAlign: 'center',
          }}>
            {[
              { value: '95%', label: 'Umbral de confianza' },
              { value: '<1s', label: 'Tiempo de verificación' },
              { value: 'Res N°38', label: 'Cumplimiento normativo' },
              { value: 'Auto', label: 'Destrucción de datos' },
            ].map((s) => (
              <div key={s.label}>
                <span style={{
                  fontFamily: 'var(--mk-font-m)',
                  fontSize: 'clamp(1.6rem, 4vw, 2.4rem)',
                  fontWeight: 800,
                  color: 'var(--mk-teal)',
                  display: 'block',
                  marginBottom: '8px',
                }}>
                  {s.value}
                </span>
                <span style={{
                  color: 'var(--mk-muted)',
                  fontSize: '0.85rem',
                }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <TrialBanner />
    </>
  )
}
