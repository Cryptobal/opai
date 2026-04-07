import Link from 'next/link'

interface TrialBannerProps {
  title?: string
  subtitle?: string
  showContactLink?: boolean
}

export function TrialBanner({
  title = 'Empieza hoy — gratis, sin tarjeta',
  subtitle = 'Crea tu cuenta en 2 minutos. Sin contratos, sin compromisos.',
  showContactLink = true,
}: TrialBannerProps) {
  return (
    <section style={{
      textAlign: 'center',
      padding: 'clamp(64px,10vw,120px) 0',
      position: 'relative',
      overflow: 'hidden',
      borderTop: '1px solid var(--mk-border)',
    }}>
      <div style={{
        position: 'absolute', bottom: '-80px', left: '50%',
        transform: 'translateX(-50%)',
        width: '500px', height: '350px',
        background: 'radial-gradient(ellipse, rgba(0,212,176,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div className="mk-container">
        <div className="mk-label" style={{ margin: '0 auto 24px' }}>
          <div className="mk-pulse" />
          Prueba gratis
        </div>
        <h2 style={{
          fontFamily: 'var(--mk-font-h)',
          fontSize: 'clamp(1.8rem,4vw,2.8rem)',
          fontWeight: 800,
          color: 'var(--mk-text)',
          maxWidth: '580px',
          margin: '0 auto 18px',
          lineHeight: 1.1,
        }}>
          {title}
        </h2>
        <p style={{
          color: 'var(--mk-muted)',
          fontSize: '1.05rem',
          maxWidth: '440px',
          margin: '0 auto 44px',
          lineHeight: 1.75,
        }}>
          {subtitle}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <Link
            href="/registrarse"
            className="mk-btn-primary"
            style={{ padding: '16px 32px', fontSize: '1rem' }}
          >
            Crear cuenta gratis →
          </Link>
          {showContactLink && (
            <Link href="/contacto" className="mk-btn-ghost">
              ¿Tienes preguntas?
            </Link>
          )}
        </div>
        <p style={{
          marginTop: '18px',
          fontFamily: 'var(--mk-font-m)',
          fontSize: '11px',
          color: 'var(--mk-muted)',
          letterSpacing: '0.04em',
        }}>
          Sin tarjeta de crédito &nbsp;·&nbsp; Plan gratis para siempre &nbsp;·&nbsp; Cancela cuando quieras
        </p>
      </div>
    </section>
  )
}
