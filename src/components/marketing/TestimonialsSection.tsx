const TESTIMONIALS = [
  {
    quote:
      "Antes teníamos 3 sistemas distintos y el gerente de operaciones vivía exportando Excel. Con OPAI todo está conectado — el cliente ve las rondas en tiempo real y dejó de llamarnos.",
    name: "Rodrigo Fuentes",
    role: "Director de Operaciones",
    company: "Empresa de Seguridad, Santiago",
  },
  {
    quote:
      "La alerta de cobertura por WhatsApp nos cambió la vida. Cuando un guardia no marca, el sistema ya tiene 3 reemplazos contactados antes de que yo me entere.",
    name: "Carolina Valdés",
    role: "Gerente de Operaciones",
    company: "Empresa de Seguridad, Valparaíso",
  },
  {
    quote:
      "Nuestros clientes ahora ven en su portal todo lo que pasa en sus instalaciones. Eso nos diferencia de la competencia y ha reducido la rotación de contratos en un 40%.",
    name: "Andrés Sepúlveda",
    role: "Gerente Comercial",
    company: "Empresa de Seguridad, Concepción",
  },
]

export default function TestimonialsSection() {
  return (
    <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
      <div className="mk-container">
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            Testimonios
          </div>
          <h2 style={{
            fontFamily: 'var(--mk-font-h)',
            fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)',
            fontWeight: 800,
            color: 'var(--mk-text)',
          }}>
            Lo que dicen nuestros clientes
          </h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '20px',
        }}>
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="mk-card"
              style={{ padding: 'clamp(24px, 3vw, 32px)' }}
            >
              {/* Stars */}
              <div style={{ display: 'flex', gap: '3px', marginBottom: '16px' }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg
                    key={i}
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="#F59E0B"
                    aria-hidden="true"
                  >
                    <path d="M8 1.333l1.867 3.78 4.133.6-2.933 2.86.72 4.094L8 10.653l-3.787 1.987.72-4.094L1.933 5.72l4.134-.6L8 1.333z" />
                  </svg>
                ))}
              </div>

              <blockquote style={{
                color: 'var(--mk-text)',
                fontSize: '0.9rem',
                lineHeight: 1.7,
                marginBottom: '20px',
                fontStyle: 'normal',
                margin: '0 0 20px 0',
                padding: 0,
                borderLeft: 'none',
              }}>
                &ldquo;{t.quote}&rdquo;
              </blockquote>

              <div>
                <div style={{
                  fontFamily: 'var(--mk-font-h)',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  color: 'var(--mk-text)',
                  marginBottom: '2px',
                }}>
                  {t.name}
                </div>
                <div style={{
                  fontFamily: 'var(--mk-font-m)',
                  fontSize: '11px',
                  color: 'var(--mk-muted)',
                }}>
                  {t.role}
                </div>
                <div style={{
                  fontFamily: 'var(--mk-font-m)',
                  fontSize: '11px',
                  color: 'var(--mk-muted)',
                }}>
                  {t.company}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
