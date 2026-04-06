const SHOWCASES = [
  {
    title: 'Pauta Mensual',
    desc: 'Drag & drop para programar turnos de guardias en cada instalación.',
    content: (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px', padding: '12px' }}>
        {/* Header row */}
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
          <div key={d} style={{
            fontFamily: 'var(--mk-font-m)',
            fontSize: '9px',
            color: 'var(--mk-muted)',
            textAlign: 'center',
            padding: '4px',
          }}>
            {d}
          </div>
        ))}
        {/* Grid blocks simulating shifts */}
        {Array.from({ length: 28 }).map((_, i) => {
          const colors = ['var(--mk-teal)', '#3B82F6', '#F59E0B', 'transparent', 'var(--mk-teal)', '#A855F7']
          const bg = colors[i % 6]
          return (
            <div
              key={i}
              style={{
                height: '18px',
                borderRadius: '2px',
                background: bg === 'transparent' ? 'rgba(101,123,160,0.08)' : bg + '30',
                border: bg === 'transparent' ? 'none' : `1px solid ${bg}40`,
              }}
            />
          )
        })}
      </div>
    ),
  },
  {
    title: 'Mapa de Rondas',
    desc: 'Monitoreo GPS en tiempo real con checkpoints y geo-fence.',
    content: (
      <div style={{ position: 'relative', height: '140px', overflow: 'hidden', padding: '12px' }}>
        {/* Abstract map grid */}
        <div style={{
          position: 'absolute',
          inset: '12px',
          background:
            'linear-gradient(var(--mk-border) 1px, transparent 1px), linear-gradient(90deg, var(--mk-border) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          opacity: 0.3,
        }} />
        {/* Route path */}
        <svg viewBox="0 0 200 100" style={{ width: '100%', height: '100%', position: 'relative' }}>
          <polyline
            points="20,80 50,30 90,60 130,20 170,50"
            fill="none"
            stroke="var(--mk-teal)"
            strokeWidth="2"
            strokeDasharray="4 4"
            opacity="0.6"
          />
          {[
            { x: 20, y: 80 },
            { x: 50, y: 30 },
            { x: 90, y: 60 },
            { x: 130, y: 20 },
            { x: 170, y: 50 },
          ].map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="5" fill="var(--mk-teal)" opacity="0.9" />
          ))}
        </svg>
      </div>
    ),
  },
  {
    title: 'Portal del Cliente',
    desc: 'Dashboard con cobertura, rondas y reportes para tus clientes.',
    content: (
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Mini stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
          {[
            { v: '98%', l: 'Cobertura' },
            { v: '24', l: 'Rondas' },
            { v: '0', l: 'Incidentes' },
          ].map((s) => (
            <div key={s.l} style={{
              background: 'rgba(0,212,176,0.06)',
              border: '1px solid rgba(0,212,176,0.12)',
              borderRadius: '3px',
              padding: '8px',
              textAlign: 'center',
            }}>
              <div style={{ fontFamily: 'var(--mk-font-h)', fontWeight: 800, color: 'var(--mk-teal)', fontSize: '14px' }}>
                {s.v}
              </div>
              <div style={{ fontFamily: 'var(--mk-font-m)', fontSize: '8px', color: 'var(--mk-muted)', textTransform: 'uppercase' }}>
                {s.l}
              </div>
            </div>
          ))}
        </div>
        {/* Mini bar chart */}
        <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '48px' }}>
          {[75, 90, 60, 95, 85, 100, 70].map((h, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${h}%`,
                background: 'var(--mk-teal)',
                borderRadius: '2px 2px 0 0',
                opacity: 0.3 + (h / 100) * 0.7,
              }}
            />
          ))}
        </div>
      </div>
    ),
  },
]

export function ProductShowcase() {
  return (
    <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
      <div className="mk-container">
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            Producto
          </div>
          <h2 style={{
            fontFamily: 'var(--mk-font-h)',
            fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)',
            fontWeight: 800,
            color: 'var(--mk-text)',
            marginBottom: '14px',
          }}>
            Producto en acción
          </h2>
          <p style={{ color: 'var(--mk-muted)', fontSize: '0.95rem', maxWidth: '480px', margin: '0 auto' }}>
            Así se ve OPAI por dentro. Cada módulo diseñado para seguridad privada.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '20px',
        }}>
          {SHOWCASES.map((s) => (
            <div
              key={s.title}
              className="mk-card"
              style={{
                overflow: 'hidden',
                transition: 'all 0.3s',
              }}
            >
              {/* App frame */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 14px',
                background: 'rgba(0,0,0,0.3)',
                borderBottom: '1px solid var(--mk-border)',
              }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FF5F56' }} />
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FFBD2E' }} />
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#27CA40' }} />
                <span style={{
                  fontFamily: 'var(--mk-font-m)',
                  fontSize: '10px',
                  color: 'var(--mk-muted)',
                  marginLeft: '6px',
                }}>
                  opai — {s.title.toLowerCase()}
                </span>
              </div>
              {/* Content */}
              <div style={{ minHeight: '160px' }}>
                {s.content}
              </div>
              {/* Label */}
              <div style={{
                padding: '14px',
                borderTop: '1px solid var(--mk-border)',
              }}>
                <h3 style={{
                  fontFamily: 'var(--mk-font-h)',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  color: 'var(--mk-text)',
                  marginBottom: '4px',
                }}>
                  {s.title}
                </h3>
                <p style={{
                  fontFamily: 'var(--mk-font-m)',
                  fontSize: '11px',
                  color: 'var(--mk-muted)',
                  margin: 0,
                }}>
                  {s.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
