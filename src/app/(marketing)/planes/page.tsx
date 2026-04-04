import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'Planes y Precios — ERP para Seguridad Privada',
  description:
    'Elige el plan OPAI ideal para tu empresa de seguridad privada. Prueba gratis 30 días sin tarjeta de crédito. Desde UF 35/mes.',
  alternates: { canonical: 'https://www.opai.cl/planes' },
  openGraph: {
    title: 'Planes y Precios | OPAI',
    description: 'Prueba gratis 30 días. Desde UF 35/mes. Sin tarjeta de crédito.',
    url: 'https://www.opai.cl/planes',
  },
}

const plans = [
  {
    id: 'trial',
    name: 'Prueba gratuita',
    headline: '30 días gratis',
    desc: 'Acceso completo al plan Esencial. Sin tarjeta de crédito. Sin compromiso.',
    featured: false,
    badge: null,
    price: 'Gratis',
    priceSub: '30 días · luego plan Esencial',
    cta: 'Crear cuenta gratis',
    ctaStyle: 'outline' as const,
    ctaHref: '/registrarse',
    external: false,
    features: [
      { label: 'Acceso completo al plan Esencial', included: true },
      { label: 'Hasta 20 guardias durante el trial', included: true },
      { label: 'Sin tarjeta de crédito requerida', included: true },
      { label: 'Soporte por email incluido', included: true },
      { label: 'Datos migran al plan Esencial', included: true },
      { label: 'Cancela en cualquier momento', included: true },
    ],
  },
  {
    id: 'esencial',
    name: 'Esencial',
    headline: 'Para comenzar',
    desc: 'El core operacional para empresas de seguridad que están creciendo.',
    featured: false,
    badge: null,
    price: 'Desde UF 35',
    priceSub: 'por mes · facturación mensual',
    cta: 'Comenzar gratis 30 días',
    ctaStyle: 'outline' as const,
    ctaHref: '/registrarse?plan=esencial',
    external: false,
    features: [
      { label: 'Gestión de guardias (fichas OS10)', included: true },
      { label: 'Pautas mensuales drag-drop', included: true },
      { label: 'Marcaciones GPS + QR + PIN', included: true },
      { label: 'Rondas GPS con geo-fence', included: true },
      { label: 'Portal Guardia (PWA)', included: true },
      { label: 'Inventario y equipamiento', included: true },
      { label: 'Onboarding digital de guardias', included: true },
      { label: 'CRM Comercial', included: false },
      { label: 'Face ID biométrico', included: false },
      { label: 'IA Operacional', included: false },
    ],
  },
  {
    id: 'profesional',
    name: 'Profesional',
    headline: 'El más elegido',
    desc: 'Operaciones completas + CRM comercial + portales para cliente y supervisor.',
    featured: true,
    badge: 'Más popular',
    price: 'Desde UF 75',
    priceSub: 'por mes · facturación mensual',
    cta: 'Comenzar gratis 30 días',
    ctaStyle: 'primary' as const,
    ctaHref: '/registrarse?plan=profesional',
    external: false,
    features: [
      { label: 'Todo lo del plan Esencial', included: true },
      { label: 'CRM + CPQ con PDF profesional', included: true },
      { label: 'Chat interno real-time (Pusher)', included: true },
      { label: 'Supervisión de campo GPS', included: true },
      { label: 'Alertas de cobertura WhatsApp', included: true },
      { label: 'Portal Cliente + Portal Supervisor', included: true },
      { label: 'Finanzas, DTE y Nómina chilena', included: true },
      { label: 'Face ID biométrico', included: false },
      { label: 'IA Operacional (Control Nocturno)', included: false },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    headline: 'Sin límites',
    desc: 'Todo el stack. IA, biometría, control de acceso y soporte prioritario.',
    featured: false,
    badge: null,
    price: 'A convenir',
    priceSub: 'según número de guardias',
    cta: 'Hablar con nosotros',
    ctaStyle: 'outline' as const,
    ctaHref: '/contacto?interes=enterprise',
    external: false,
    features: [
      { label: 'Todo lo del plan Profesional', included: true },
      { label: 'Face ID AWS Rekognition', included: true },
      { label: 'IA Operacional (RAG, OCR, análisis)', included: true },
      { label: 'Control de Acceso físico + OCR', included: true },
      { label: 'Fiscalización DT', included: true },
      { label: 'App iOS/Android nativa', included: true },
      { label: 'SLA garantizado', included: true },
      { label: 'Onboarding y migración dedicada', included: true },
      { label: 'Soporte prioritario', included: true },
    ],
  },
]

const addons = [
  { icon: '🪪', name: 'Face ID Biométrico', desc: 'AWS Rekognition para marcaciones', detail: 'Threshold 95%, quality checks, compliance Res. N°38' },
  { icon: '🤖', name: 'IA Operacional', desc: 'RAG, OCR, análisis nocturno', detail: 'gpt-4o + Claude fallback, frustration detection' },
  { icon: '📱', name: 'App iOS/Android', desc: 'Capacitor nativo', detail: 'GPS, Camera, Biometrics, Push Notifications' },
  { icon: '🚪', name: 'Control de Acceso', desc: 'OCR patentes y MRZ', detail: 'Visitantes, preregistro, dispositivos' },
  { icon: '⚖️', name: 'Fiscalización DT', desc: 'Portal inspector temporal', detail: 'Credenciales expiración, datos auditables' },
  { icon: '🏷️', name: 'White-label', desc: 'Tu marca en el sistema', detail: 'Dominio propio, colores y logo personalizados' },
]

const faq = [
  {
    q: '¿Necesito tarjeta de crédito para registrarme?',
    a: 'No. Los primeros 30 días son completamente gratuitos y no pedimos datos de pago. Solo tu nombre, empresa y email.',
  },
  {
    q: '¿Qué pasa cuando terminan los 30 días?',
    a: 'Al día 23 recibes un aviso por email. Al día 30, tu cuenta pasa automáticamente al plan Esencial. Si decides no continuar, puedes cancelar en cualquier momento antes del vencimiento.',
  },
  {
    q: '¿Cuántos guardias puedo ingresar durante el trial?',
    a: 'Hasta 20 guardias activos durante el período de prueba. Si tienes más, el plan Esencial no tiene ese límite.',
  },
  {
    q: '¿Mis datos quedan guardados si no continúo?',
    a: 'Sí. Tienes 30 días adicionales para exportar toda tu información después de que venza el trial.',
  },
  {
    q: '¿Puedo cambiar de plan después?',
    a: 'Sí, en cualquier momento desde la configuración de tu cuenta. El cambio se aplica en el próximo ciclo de facturación.',
  },
  {
    q: '¿Hay costo de implementación o configuración?',
    a: 'No. OPAI está diseñado para que cualquier empresa pueda configurarlo sola. El plan Enterprise incluye onboarding dedicado sin costo adicional.',
  },
  {
    q: '¿Qué incluye exactamente el plan Esencial?',
    a: 'Gestión de guardias (fichas OS10), pautas mensuales, marcaciones GPS/QR/PIN, rondas con geo-fence, portal guardia, inventario y onboarding digital. Todo lo necesario para operar.',
  },
]

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faq.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

export default function PlanesPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      {/* Hero */}
      <section style={{ padding: 'clamp(80px,12vw,140px) 0 clamp(40px,6vw,80px)' }}>
        <div className="mk-container" style={{ textAlign: 'center' }}>
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            Planes y precios
          </div>
          <h1 style={{
            fontFamily: 'var(--mk-font-h)',
            fontSize: 'clamp(2rem,5vw,3.5rem)',
            fontWeight: 900,
            color: 'var(--mk-text)',
            maxWidth: '700px',
            margin: '0 auto 18px',
            lineHeight: 1.1,
          }}>
            Empieza gratis. Escala cuando crezcas.
          </h1>
          <p style={{ color: 'var(--mk-muted)', fontSize: '1.1rem', maxWidth: '520px', margin: '0 auto', lineHeight: 1.7 }}>
            30 días de prueba gratuita con el plan Esencial. Sin tarjeta de crédito. Cancela cuando quieras.
          </p>
        </div>
      </section>

      {/* Plans grid */}
      <section style={{ paddingBottom: 'var(--mk-section)' }}>
        <div className="mk-container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', alignItems: 'start' }}>
            {plans.map(plan => (
              <div
                key={plan.id}
                style={{
                  background: plan.featured ? 'var(--mk-bg-card-h)' : 'var(--mk-bg-card)',
                  border: plan.featured ? '2px solid var(--mk-teal)' : '1px solid var(--mk-border)',
                  borderRadius: '6px',
                  padding: 'clamp(24px,3vw,36px)',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {plan.badge && (
                  <div style={{
                    position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--mk-teal)', color: '#020A0E', fontFamily: 'var(--mk-font-h)',
                    fontWeight: 700, fontSize: '11px', padding: '4px 14px', borderRadius: '2px',
                    textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap',
                  }}>
                    {plan.badge}
                  </div>
                )}
                <span style={{ fontFamily: 'var(--mk-font-m)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--mk-teal)', marginBottom: '6px' }}>
                  {plan.headline}
                </span>
                <h3 style={{ fontFamily: 'var(--mk-font-h)', fontSize: '1.3rem', fontWeight: 800, color: 'var(--mk-text)', marginBottom: '8px' }}>
                  {plan.name}
                </h3>
                <p style={{ color: 'var(--mk-muted)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '20px' }}>
                  {plan.desc}
                </p>
                <div style={{ marginBottom: '24px' }}>
                  <span style={{ fontFamily: 'var(--mk-font-h)', fontSize: 'clamp(1.6rem,3vw,2.2rem)', fontWeight: 900, color: 'var(--mk-text)' }}>
                    {plan.price}
                  </span>
                  <span style={{ display: 'block', fontFamily: 'var(--mk-font-m)', fontSize: '11px', color: 'var(--mk-muted)', marginTop: '4px' }}>
                    {plan.priceSub}
                  </span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                  {plan.features.map(f => (
                    <li key={f.label} style={{ display: 'flex', gap: '8px', fontSize: '0.83rem', color: f.included ? 'var(--mk-muted)' : 'rgba(101,123,160,0.4)', alignItems: 'flex-start' }}>
                      <span style={{ flexShrink: 0, fontWeight: 700, color: f.included ? 'var(--mk-teal)' : 'rgba(101,123,160,0.3)' }}>
                        {f.included ? '✓' : '—'}
                      </span>
                      {f.label}
                    </li>
                  ))}
                </ul>
                {plan.external ? (
                  <a
                    href={plan.ctaHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={plan.ctaStyle === 'primary' ? 'mk-btn-primary' : 'mk-btn-ghost'}
                    style={{ textAlign: 'center', justifyContent: 'center', width: '100%' }}
                  >
                    {plan.cta}
                  </a>
                ) : (
                  <Link
                    href={plan.ctaHref}
                    className={plan.ctaStyle === 'primary' ? 'mk-btn-primary' : 'mk-btn-ghost'}
                    style={{ textAlign: 'center', justifyContent: 'center', width: '100%' }}
                  >
                    {plan.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Add-ons */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container">
          <div style={{ textAlign: 'center', maxWidth: '560px', margin: '0 auto 48px' }}>
            <div className="mk-label" style={{ margin: '0 auto 24px' }}>
              <div className="mk-pulse" />
              Módulos adicionales
            </div>
            <h2 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 'clamp(1.6rem,3.5vw,2.4rem)', fontWeight: 800, color: 'var(--mk-text)', marginBottom: '14px' }}>
              Amplía tu plan con módulos especializados
            </h2>
            <p style={{ color: 'var(--mk-muted)', fontSize: '0.95rem' }}>
              Disponibles como complemento en cualquier plan. Consulta precios en tu demo.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
            {addons.map(a => (
              <div key={a.name} className="mk-card" style={{ padding: 'clamp(20px,3vw,28px)' }}>
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>{a.icon}</div>
                <h3 style={{ fontFamily: 'var(--mk-font-h)', fontSize: '1rem', fontWeight: 700, color: 'var(--mk-text)', marginBottom: '6px' }}>{a.name}</h3>
                <p style={{ color: 'var(--mk-muted)', fontSize: '0.85rem', marginBottom: '8px' }}>{a.desc}</p>
                <p style={{ fontFamily: 'var(--mk-font-m)', fontSize: '10px', color: 'var(--mk-muted)', background: 'var(--mk-bg)', border: '1px solid var(--mk-border)', padding: '4px 8px', borderRadius: '2px', display: 'inline-block' }}>
                  {a.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container" style={{ maxWidth: '760px' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <div className="mk-label" style={{ margin: '0 auto 24px' }}>
              <div className="mk-pulse" />
              Preguntas frecuentes
            </div>
            <h2 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 'clamp(1.6rem,3.5vw,2.4rem)', fontWeight: 800, color: 'var(--mk-text)' }}>
              Preguntas sobre planes y precios
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {faq.map(f => (
              <div key={f.q} style={{ background: 'var(--mk-bg-card)', border: '1px solid var(--mk-border)', borderRadius: '4px', padding: 'clamp(18px,3vw,28px)' }}>
                <h3 style={{ fontFamily: 'var(--mk-font-h)', fontSize: '0.95rem', fontWeight: 700, color: 'var(--mk-text)', marginBottom: '10px' }}>
                  {f.q}
                </h3>
                <p style={{ color: 'var(--mk-muted)', fontSize: '0.88rem', lineHeight: 1.7 }}>
                  {f.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <TrialBanner
        title="Elige tu plan y empieza gratis"
        subtitle="Los primeros 30 días son sin costo. Sin tarjeta requerida."
      />
    </>
  )
}
