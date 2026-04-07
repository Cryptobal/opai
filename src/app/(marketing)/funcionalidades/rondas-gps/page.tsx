import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'Control de Rondas GPS con IA',
  description:
    'Rondas GPS inteligentes con checkpoints QR, geo-fence adaptativo, Trust Score 0-100, detección de anomalías y resúmenes nocturnos con IA.',
  alternates: {
    canonical: 'https://www.opai.cl/funcionalidades/rondas-gps',
  },
  openGraph: {
    title: 'Control de Rondas GPS con IA | OPAI',
    description:
      'Rondas GPS inteligentes con checkpoints QR, geo-fence adaptativo, Trust Score 0-100, detección de anomalías y resúmenes nocturnos con IA.',
    url: 'https://www.opai.cl/funcionalidades/rondas-gps',
    type: 'website',
    images: [{ url: '/icons/og-image.png', width: 1200, height: 630, alt: 'OPAI — ERP con IA para Seguridad Privada' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Control de Rondas GPS con IA | OPAI',
    description: 'Checkpoints QR, geo-fence adaptativo, Trust Score y resúmenes nocturnos.',
    images: ['/icons/og-image.png'],
  },
}

const features = [
  {
    title: 'Checkpoints QR + GPS',
    description:
      'Cada punto de ronda combina un código QR físico con validación GPS. El guardia escanea el QR y el sistema confirma que está en la ubicación correcta.',
  },
  {
    title: 'Geo-fence con precisión adaptativa',
    description:
      'El radio de validación se ajusta automáticamente según la precisión del GPS del dispositivo. En zonas con mala señal, el sistema compensa sin falsos negativos.',
  },
  {
    title: 'Trust Score 0-100',
    description:
      'Cada ronda recibe un puntaje de confianza calculado con múltiples factores: precisión GPS, velocidad entre puntos, tiempo en cada checkpoint y patrones históricos.',
  },
  {
    title: 'Detección de anomalías',
    description:
      'Velocidad imposible entre checkpoints, tiempos sospechosamente cortos, ubicación fuera de rango — la IA detecta patrones irregulares y alerta al supervisor en tiempo real.',
  },
  {
    title: 'Monitoreo en tiempo real',
    description:
      'Mapa en vivo con la posición de cada guardia, estado de las rondas en curso, alertas de retraso y vista consolidada para el centro de control.',
  },
  {
    title: 'Resumen nocturno con IA',
    description:
      'Cada mañana, el sistema genera automáticamente un análisis de todas las rondas nocturnas: anomalías detectadas, puntos omitidos, tendencias y recomendaciones.',
  },
]

export default function RondasGpsPage() {
  return (
    <>
      {/* Hero */}
      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="mk-container">
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            Rondas GPS
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
            Rondas GPS inteligentes con anomaly detection
          </h1>
          <p style={{
            color: 'var(--mk-muted)',
            fontSize: 'clamp(1rem, 2vw, 1.15rem)',
            lineHeight: 1.75,
            maxWidth: '600px',
            margin: '0 auto 40px',
          }}>
            No basta con saber dónde está el guardia — necesitas saber si la ronda fue real.
            Trust Score, detección de anomalías y resúmenes con IA integrados.
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

      {/* Trust Score callout */}
      <section style={{ paddingBottom: 'var(--mk-section)' }}>
        <div className="mk-container">
          <div className="mk-card" style={{
            padding: 'clamp(32px, 4vw, 56px)',
            textAlign: 'center',
            borderColor: 'var(--mk-teal-mid)',
            background: 'linear-gradient(180deg, var(--mk-teal-dim) 0%, var(--mk-bg-card) 100%)',
          }}>
            <span style={{
              fontFamily: 'var(--mk-font-m)',
              fontSize: 'clamp(3rem, 8vw, 5rem)',
              fontWeight: 800,
              color: 'var(--mk-teal)',
              display: 'block',
              lineHeight: 1,
              marginBottom: '16px',
            }}>
              0 — 100
            </span>
            <h2 style={{
              fontFamily: 'var(--mk-font-h)',
              fontSize: 'clamp(1.2rem, 3vw, 1.6rem)',
              fontWeight: 700,
              color: 'var(--mk-text)',
              marginBottom: '12px',
            }}>
              Trust Score por ronda
            </h2>
            <p style={{
              color: 'var(--mk-muted)',
              fontSize: '0.95rem',
              lineHeight: 1.75,
              maxWidth: '520px',
              margin: '0 auto',
            }}>
              Cada ronda es evaluada con un puntaje de confianza que considera velocidad, tiempo,
              precisión GPS y patrones históricos. Tus clientes ven el score; tu equipo mejora.
            </p>
          </div>
        </div>
      </section>

      <TrialBanner />
    </>
  )
}
