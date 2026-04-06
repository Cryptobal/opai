const STATS = [
  { value: '6', label: 'Portales especializados', icon: '🌐' },
  { value: '18', label: 'Automatizaciones cron', icon: '⚙️' },
  { value: '14', label: 'Módulos disponibles', icon: '📦' },
  { value: '259', label: 'Modelos de datos', icon: '🧱' },
  { value: '801', label: 'Endpoints API', icon: '🔌' },
  { value: '12', label: 'Integraciones nativas', icon: '🔗' },
]

export function ImpactStats() {
  return (
    <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
      <div className="mk-container">
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            La plataforma
          </div>
          <h2 style={{
            fontFamily: 'var(--mk-font-h)',
            fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)',
            fontWeight: 800,
            color: 'var(--mk-text)',
            marginBottom: '14px',
          }}>
            Construido para escalar
          </h2>
          <p style={{ color: 'var(--mk-muted)', fontSize: '0.95rem', maxWidth: '480px', margin: '0 auto' }}>
            OPAI no es un MVP. Es una plataforma completa, probada en producción.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '16px',
        }}>
          {STATS.map((s) => (
            <div
              key={s.label}
              className="mk-card"
              style={{
                padding: 'clamp(20px, 3vw, 28px)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.4rem', marginBottom: '10px' }} role="img" aria-label={s.label}>
                {s.icon}
              </div>
              <div style={{
                fontFamily: 'var(--mk-font-h)',
                fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
                fontWeight: 900,
                color: 'var(--mk-teal)',
                marginBottom: '4px',
              }}>
                {s.value}
              </div>
              <div style={{
                fontFamily: 'var(--mk-font-m)',
                fontSize: '10px',
                color: 'var(--mk-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
