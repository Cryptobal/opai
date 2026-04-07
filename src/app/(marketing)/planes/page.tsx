import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'
import { PricingCalculator } from '@/components/marketing/PricingCalculator'

export const metadata: Metadata = {
  title: 'Planes y Precios — ERP para Seguridad Privada',
  description:
    'Plan gratis para siempre con hasta 10 guardias. Escala con add-ons modulares: rondas GPS, CRM, finanzas, Face ID, IA. Desde UF 0.5 por guardia/mes.',
  alternates: { canonical: 'https://www.opai.cl/planes' },
  openGraph: {
    title: 'Planes y Precios | OPAI',
    description: 'Plan gratis para siempre. Add-ons modulares. Desde UF 0.5 por guardia/mes.',
    url: 'https://www.opai.cl/planes',
    type: 'website',
    images: [{ url: '/icons/og-image.png', width: 1200, height: 630, alt: 'OPAI — ERP con IA para Seguridad Privada' }],
  },
}
const plans = [
  {
    id: 'free',
    name: 'Gratis',
    headline: 'Para siempre',
    desc: 'Digitaliza tu operaci\u00f3n sin costo. Hasta 10 guardias activos, sin l\u00edmite de tiempo.',
    featured: false,
    badge: null,
    price: 'Gratis',
    priceSub: 'hasta 10 guardias \u00b7 para siempre',
    cta: 'Crear cuenta gratis',
    ctaStyle: 'outline' as const,
    ctaHref: '/registrarse',
    features: [
      { label: 'Gesti\u00f3n de guardias (fichas OS10)', included: true },
      { label: 'Pautas mensuales drag-drop', included: true },
      { label: 'Pauta diaria en tiempo real', included: true },
      { label: 'Marcaciones GPS + QR + PIN', included: true },
      { label: 'Puestos operativos por instalaci\u00f3n', included: true },
      { label: 'PPC + Turnos extra + Refuerzos', included: true },
      { label: 'Onboarding digital de guardias', included: true },
      { label: 'Portal Guardia (PWA)', included: true },
      { label: 'Portal Marcaci\u00f3n dedicado', included: true },
      { label: 'Notificaciones (bell + email)', included: true },
      { label: 'Configuraci\u00f3n de empresa', included: true },
      { label: '1 usuario admin', included: true },
      { label: 'Soporte por email', included: true },
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    headline: 'Para crecer',
    desc: 'Operaci\u00f3n profesional con tickets, documentos, comunicaciones y auditor\u00eda.',
    featured: false,
    badge: null,
    price: 'Desde UF 0.5',
    priceSub: 'por guardia/mes \u00b7 m\u00edn UF 20',
    cta: 'Comenzar gratis',
    ctaStyle: 'outline' as const,
    ctaHref: '/registrarse?plan=starter',
    features: [
      { label: 'Todo lo del plan Gratis', included: true },
      { label: 'Guardias ilimitados', included: true },
      { label: 'Tickets con SLA configurable', included: true },
      { label: 'Comunicaciones y plantillas', included: true },
      { label: 'Documentos con templates y tokens', included: true },
      { label: 'Documentos por instalaci\u00f3n', included: true },
      { label: 'Roles RBAC (13 roles)', included: true },
      { label: 'Log de auditor\u00eda', included: true },
      { label: 'Hasta 5 usuarios admin', included: true },
      { label: 'Soporte por email', included: true },
    ],
  },
  {
    id: 'profesional',
    name: 'Profesional',
    headline: 'El m\u00e1s elegido',
    desc: 'Control total: supervisi\u00f3n GPS, alertas WhatsApp, chat, firma digital y portales avanzados.',
    featured: true,
    badge: 'M\u00e1s popular',
    price: 'Desde UF 0.8',
    priceSub: 'por guardia/mes \u00b7 m\u00edn UF 45',
    cta: 'Comenzar gratis',
    ctaStyle: 'primary' as const,
    ctaHref: '/registrarse?plan=profesional',
    features: [
      { label: 'Todo lo del plan Starter', included: true },
      { label: 'Alertas de cobertura WhatsApp + email', included: true },
      { label: 'Supervisi\u00f3n de campo GPS', included: true },
      { label: 'Hallazgos, evaluaciones y health scores', included: true },
      { label: 'Chat interno real-time', included: true },
      { label: 'Chat externo (con clientes)', included: true },
      { label: 'Firma digital de documentos', included: true },
      { label: 'Gesti\u00f3n de contratos y anexos', included: true },
      { label: 'Portal Supervisor', included: true },
      { label: 'Gamificaci\u00f3n de guardias', included: true },
      { label: 'Hasta 15 usuarios admin', included: true },
      { label: 'Soporte por chat prioritario', included: true },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    headline: 'Sin l\u00edmites',
    desc: 'Todo OPAI. Todos los add-ons incluidos, IA, biometr\u00eda, SLA garantizado y soporte dedicado.',
    featured: false,
    badge: null,
    price: 'A convenir',
    priceSub: 'seg\u00fan n\u00famero de guardias',
    cta: 'Hablar con nosotros',
    ctaStyle: 'outline' as const,
    ctaHref: '/contacto?interes=enterprise',
    features: [
      { label: 'Todo lo del plan Profesional', included: true },
      { label: 'Todos los add-ons incluidos', included: true },
      { label: 'Face ID AWS Rekognition', included: true },
      { label: 'IA Operacional (RAG, OCR, an\u00e1lisis)', included: true },
      { label: 'App iOS/Android nativa', included: true },
      { label: 'SLA garantizado', included: true },
      { label: 'API access', included: true },
      { label: 'Usuarios admin ilimitados', included: true },
      { label: 'Onboarding y migraci\u00f3n dedicada', included: true },
      { label: 'Soporte dedicado con SLA', included: true },
    ],
  },
]

const featureComparison: {
  category: string
  icon: string
  features: { name: string; free: boolean | string; starter: boolean | string; profesional: boolean | string; enterprise: boolean | string }[]
}[] = [
  {
    category: 'Gesti\u00f3n de Guardias',
    icon: '\ud83d\udc64',
    features: [
      { name: 'Fichas de guardias con credencial OS10', free: true, starter: true, profesional: true, enterprise: true },
      { name: 'Onboarding digital (postulaci\u00f3n online)', free: true, starter: true, profesional: true, enterprise: true },
      { name: 'Comunicaciones y plantillas', free: false, starter: true, profesional: true, enterprise: true },
      { name: 'Gamificaci\u00f3n (puntos, badges, ranking)', free: false, starter: false, profesional: true, enterprise: true },
    ],
  },
  {
    category: 'Planificaci\u00f3n Operacional',
    icon: '\ud83d\udcc5',
    features: [
      { name: 'Pautas mensuales drag-drop', free: true, starter: true, profesional: true, enterprise: true },
      { name: 'Pauta diaria en tiempo real', free: true, starter: true, profesional: true, enterprise: true },
      { name: 'Puestos operativos por instalaci\u00f3n', free: true, starter: true, profesional: true, enterprise: true },
      { name: 'PPC (Puestos por cubrir)', free: true, starter: true, profesional: true, enterprise: true },
      { name: 'Turnos extra (registro, aprobaci\u00f3n, pago)', free: true, starter: true, profesional: true, enterprise: true },
      { name: 'Refuerzos', free: true, starter: true, profesional: true, enterprise: true },
    ],
  },
  {
    category: 'Marcaci\u00f3n y Asistencia',
    icon: '\ud83d\udccd',
    features: [
      { name: 'Marcaciones GPS + QR + PIN', free: true, starter: true, profesional: true, enterprise: true },
      { name: 'Portal Marcaci\u00f3n dedicado (kiosco/tablet)', free: true, starter: true, profesional: true, enterprise: true },
      { name: 'Alertas de cobertura (WhatsApp + email con oleadas geogr\u00e1ficas)', free: false, starter: false, profesional: true, enterprise: true },
    ],
  },
  {
    category: 'Portales',
    icon: '\ud83c\udf10',
    features: [
      { name: 'Portal Guardia (PWA)', free: true, starter: true, profesional: true, enterprise: true },
      { name: 'Portal Marcaci\u00f3n', free: true, starter: true, profesional: true, enterprise: true },
      { name: 'Portal Supervisor', free: false, starter: false, profesional: true, enterprise: true },
    ],
  },
  {
    category: 'Supervisi\u00f3n de Campo',
    icon: '\ud83d\udd0d',
    features: [
      { name: 'Visitas de supervisi\u00f3n con GPS y fotos', free: false, starter: false, profesional: true, enterprise: true },
      { name: 'Hallazgos, evaluaciones, health scores', free: false, starter: false, profesional: true, enterprise: true },
      { name: 'Reportes de supervisi\u00f3n', free: false, starter: false, profesional: true, enterprise: true },
    ],
  },
  {
    category: 'Gesti\u00f3n Documental',
    icon: '\ud83d\udcc4',
    features: [
      { name: 'Documentos con templates y tokens din\u00e1micos', free: false, starter: true, profesional: true, enterprise: true },
      { name: 'Documentos requeridos por instalaci\u00f3n', free: false, starter: true, profesional: true, enterprise: true },
      { name: 'Firma digital (multi-firmante, recordatorios)', free: false, starter: false, profesional: true, enterprise: true },
      { name: 'Gesti\u00f3n de contratos y anexos', free: false, starter: false, profesional: true, enterprise: true },
    ],
  },
  {
    category: 'Comunicaci\u00f3n',
    icon: '\ud83d\udcac',
    features: [
      { name: 'Notificaciones bell + email (23 tipos)', free: true, starter: true, profesional: true, enterprise: true },
      { name: 'Chat interno real-time (Pusher)', free: false, starter: false, profesional: true, enterprise: true },
      { name: 'Chat externo con clientes', free: false, starter: false, profesional: true, enterprise: true },
    ],
  },
  {
    category: 'Tickets y Solicitudes',
    icon: '\ud83c\udfab',
    features: [
      { name: 'Tickets con SLA, tipos configurables, aprobaciones', free: false, starter: true, profesional: true, enterprise: true },
    ],
  },
  {
    category: 'Administraci\u00f3n',
    icon: '\u2699\ufe0f',
    features: [
      { name: 'Usuarios admin', free: '1', starter: '5', profesional: '15', enterprise: 'Ilimitados' },
      { name: 'Roles RBAC configurables (13 roles)', free: 'B\u00e1sico', starter: true, profesional: true, enterprise: true },
      { name: 'Log de auditor\u00eda', free: false, starter: true, profesional: true, enterprise: true },
      { name: 'Configuraci\u00f3n de empresa', free: true, starter: true, profesional: true, enterprise: true },
    ],
  },
]

const addons = [
  { icon: '\ud83d\udccd', name: 'Rondas GPS', desc: 'Checkpoints con geo-fence, QR, templates, programaci\u00f3n, monitoreo real-time, alertas, reportes y portal dedicado.', pricing: 'Desde UF 0.15/guardia/mes', tag: 'Operacional' },
  { icon: '\ud83c\udf19', name: 'Control Nocturno IA', desc: 'An\u00e1lisis autom\u00e1tico de novedades nocturnas con IA, KPIs de operaci\u00f3n nocturna, detecci\u00f3n de anomal\u00edas.', pricing: 'Desde UF 0.10/guardia/mes', tag: 'Operacional' },
  { icon: '\ud83d\udce6', name: 'Inventario', desc: 'Bodegas, productos, stock, l\u00edneas, compras, entregas, activos. Asignaci\u00f3n por guardia e instalaci\u00f3n.', pricing: 'Desde UF 5/mes', tag: 'Operacional' },
  { icon: '\ud83d\udcbc', name: 'CRM Comercial', desc: 'Leads, contactos, cuentas, deals, pipeline, instalaciones y prospecting automatizado.', pricing: 'Desde UF 8/mes', tag: 'Comercial' },
  { icon: '\ud83e\uddee', name: 'CPQ (Cotizador)', desc: 'Configure-Price-Quote con c\u00e1lculo de costo empleador Chile, PDF profesional y email tracking.', pricing: 'Desde UF 5/mes', tag: 'Comercial' },
  { icon: '\ud83c\udfe2', name: 'Portal Cliente', desc: 'Dashboard para clientes: contratos, reportes de asistencia, documentos, solicitudes y chat.', pricing: 'Desde UF 3/cliente activo/mes', tag: 'Comercial' },
  { icon: '\ud83d\udcca', name: 'Finanzas + DTE', desc: 'Facturaci\u00f3n electr\u00f3nica SII, rendiciones, aprobaciones, pagos, proveedores, conciliaci\u00f3n bancaria, contabilidad y reportes.', pricing: 'Desde UF 10/mes', tag: 'Financiero' },
  { icon: '\ud83d\udcb0', name: 'Payroll / N\u00f3mina', desc: 'Liquidaciones de sueldo Chile, anticipos, par\u00e1metros legales, simulador, per\u00edodos y asistencia.', pricing: 'Desde UF 0.10/guardia/mes', tag: 'Financiero' },
  { icon: '\ud83e\udea3', name: 'Face ID Biom\u00e9trico', desc: 'Marcaci\u00f3n facial con AWS Rekognition. Threshold 95%, quality checks, cumplimiento Res. N\u00b038 DT.', pricing: 'Desde UF 0.12/guardia/mes', tag: 'Premium' },
  { icon: '\ud83e\udd16', name: 'IA Operacional', desc: 'Asistente IA contextual con RAG, OCR de documentos, an\u00e1lisis predictivo y detecci\u00f3n de frustraci\u00f3n.', pricing: 'Desde UF 8/mes', tag: 'Premium' },
  { icon: '\ud83d\udeaa', name: 'Control de Acceso', desc: 'OCR de patentes, lectura MRZ, gesti\u00f3n de visitantes, preregistro y portal de acceso dedicado.', pricing: 'Desde UF 5/punto de acceso/mes', tag: 'Premium' },
  { icon: '\u2696\ufe0f', name: 'Fiscalizaci\u00f3n DT + Reporter\u00eda', desc: 'Portal temporal para inspector DT, credenciales con expiraci\u00f3n, reportes DT (asistencia, jornada, domingos/festivos).', pricing: 'Desde UF 5/mes', tag: 'Premium' },
  { icon: '\ud83c\udff7\ufe0f', name: 'White-label', desc: 'Tu marca en toda la plataforma: dominio propio, colores, logo y portales personalizados.', pricing: 'Desde UF 15/mes', tag: 'Premium' },
  { icon: '\ud83d\udcf1', name: 'App iOS/Android', desc: 'App publicada en stores con Capacitor: GPS nativo, c\u00e1mara, biometrics y push notifications.', pricing: 'Desde UF 10/mes', tag: 'Premium' },
]

const tagColors: Record<string, string> = {
  Operacional: '#3B82F6',
  Comercial: '#F59E0B',
  Financiero: '#10B981',
  Premium: '#A855F7',
}

const packs = [
  { name: 'Pack Operaciones', includes: 'Rondas GPS + Control Nocturno IA', discount: '15% descuento', icon: '\ud83d\udee1' },
  { name: 'Pack Comercial', includes: 'CRM + CPQ + Portal Cliente', discount: '20% descuento', icon: '\ud83d\udcbc' },
  { name: 'Pack Finanzas', includes: 'Finanzas + DTE + Payroll', discount: '15% descuento', icon: '\ud83d\udcca' },
  { name: 'Pack Completo', includes: 'Todos los add-ons', discount: '30% descuento', icon: '\u26a1' },
]

const faq = [
  { q: '\u00bfEl plan Gratis es realmente gratis para siempre?', a: 'S\u00ed. Puedes usar OPAI con hasta 10 guardias activos sin l\u00edmite de tiempo, sin tarjeta de cr\u00e9dito y sin compromiso. Cuando necesites m\u00e1s guardias o funcionalidades avanzadas, puedes subir de plan.' },
  { q: '\u00bfQu\u00e9 pasa si supero los 10 guardias en el plan Gratis?', a: 'Al guardia n\u00famero 11, el sistema te pedir\u00e1 que elijas un plan pagado. Tus datos, configuraci\u00f3n y todo tu historial se mantienen intactos al hacer upgrade.' },
  { q: '\u00bfLos add-ons se pueden agregar a cualquier plan?', a: 'S\u00ed, cualquier add-on se puede agregar a cualquier plan pagado (Starter, Profesional o Enterprise). El plan Enterprise ya incluye todos los add-ons sin costo adicional.' },
  { q: '\u00bfPuedo probar un add-on antes de contratarlo?', a: 'S\u00ed. Al crear tu cuenta tienes 30 d\u00edas de prueba con acceso completo a todos los m\u00f3dulos. Despu\u00e9s eliges qu\u00e9 plan y qu\u00e9 add-ons quieres mantener.' },
  { q: '\u00bfC\u00f3mo funciona el cobro por guardia?', a: 'Se cobra por guardia activo al mes. Si un guardia est\u00e1 inactivo, no se cobra. Cada plan tiene un m\u00ednimo mensual (UF 20 en Starter, UF 45 en Profesional).' },
  { q: '\u00bfPuedo cambiar de plan o agregar/quitar add-ons?', a: 'S\u00ed, en cualquier momento desde la configuraci\u00f3n de tu cuenta. Los cambios se aplican en el pr\u00f3ximo ciclo de facturaci\u00f3n.' },
  { q: '\u00bfHay costo de implementaci\u00f3n?', a: 'No. OPAI est\u00e1 dise\u00f1ado para autoservicio. El plan Enterprise incluye onboarding y migraci\u00f3n dedicada sin costo adicional.' },
  { q: '\u00bfQu\u00e9 son las alertas de cobertura?', a: 'Cuando un guardia no se presenta a su turno, OPAI dispara alertas autom\u00e1ticas por WhatsApp y email. El sistema busca reemplazos por oleadas geogr\u00e1ficas: primero guardias cercanos, luego ampl\u00eda el radio hasta encontrar cobertura.' },
  { q: '\u00bfQu\u00e9 son las Rondas GPS?', a: 'Las rondas son recorridos que hace el guardia por checkpoints definidos en la instalaci\u00f3n. OPAI verifica con geo-fence que el guardia pas\u00f3 por cada punto, genera reportes autom\u00e1ticos, y alerta si hay anomal\u00edas. Incluye programaci\u00f3n, templates y un portal dedicado.' },
]

const productJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'OPAI',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web, iOS, Android',
  offers: [
    { '@type': 'Offer', name: 'Gratis', price: '0', priceCurrency: 'CLP', description: 'Hasta 10 guardias, para siempre' },
    { '@type': 'Offer', name: 'Starter', price: '0.5', priceCurrency: 'CLF', description: 'Por guardia activo/mes, mín UF 20', priceSpecification: { '@type': 'UnitPriceSpecification', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitText: 'guardia/mes' } } },
    { '@type': 'Offer', name: 'Profesional', price: '0.8', priceCurrency: 'CLF', description: 'Por guardia activo/mes, mín UF 45', priceSpecification: { '@type': 'UnitPriceSpecification', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitText: 'guardia/mes' } } },
    { '@type': 'Offer', name: 'Enterprise', price: '0', priceCurrency: 'CLF', description: 'Precio a convenir según número de guardias' },
  ],
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faq.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

function renderCellValue(value: boolean | string) {
  if (typeof value === 'string') {
    return <span style={{ color: 'var(--mk-teal)', fontFamily: 'var(--mk-font-m)', fontSize: '0.8rem' }}>{value}</span>
  }
  if (value) {
    return <span style={{ color: 'var(--mk-teal)', fontWeight: 700 }}>{'\u2713'}</span>
  }
  return <span style={{ color: 'rgba(101,123,160,0.3)' }}>{'\u2014'}</span>
}

export default function PlanesPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      {/* Hero */}
      <section style={{ padding: 'clamp(80px,12vw,140px) 0 clamp(40px,6vw,80px)' }}>
        <div className="mk-container" style={{ textAlign: 'center' }}>
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            Planes y precios
          </div>
          <div style={{
            display: 'inline-block',
            background: 'var(--mk-teal-dim)',
            border: '1px solid var(--mk-teal-glow)',
            borderRadius: '2px',
            padding: '6px 16px',
            fontFamily: 'var(--mk-font-m)',
            fontSize: '12px',
            color: 'var(--mk-teal)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontWeight: 700,
            marginBottom: '24px',
          }}>
            Gratis para siempre
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
          <p style={{ color: 'var(--mk-muted)', fontSize: '1.1rem', maxWidth: '560px', margin: '0 auto', lineHeight: 1.7 }}>
            Plan gratis para siempre con hasta 10 guardias. Agrega m{'\u00f3'}dulos cuando los necesites.
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
                        {f.included ? '\u2713' : '\u2014'}
                      </span>
                      {f.label}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.ctaHref}
                  className={plan.ctaStyle === 'primary' ? 'mk-btn-primary' : 'mk-btn-ghost'}
                  style={{ textAlign: 'center', justifyContent: 'center', width: '100%' }}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cotizador interactivo */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container">
          <div style={{ textAlign: 'center', maxWidth: '560px', margin: '0 auto 48px' }}>
            <div className="mk-label" style={{ margin: '0 auto 24px' }}>
              <div className="mk-pulse" />
              Cotizador
            </div>
            <h2 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 'clamp(1.6rem,3.5vw,2.4rem)', fontWeight: 800, color: 'var(--mk-text)', marginBottom: '14px' }}>
              Calcula tu precio en segundos
            </h2>
            <p style={{ color: 'var(--mk-muted)', fontSize: '0.95rem' }}>
              Mueve el slider, activa los módulos que necesitas, y ve el precio actualizado al instante.
            </p>
          </div>
          <PricingCalculator />
        </div>
      </section>

      {/* Feature comparison */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container">
          <div style={{ textAlign: 'center', maxWidth: '560px', margin: '0 auto 48px' }}>
            <div className="mk-label" style={{ margin: '0 auto 24px' }}>
              <div className="mk-pulse" />
              Comparaci{'\u00f3'}n detallada
            </div>
            <h2 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 'clamp(1.6rem,3.5vw,2.4rem)', fontWeight: 800, color: 'var(--mk-text)' }}>
              Compara los planes en detalle
            </h2>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: '700px' }}>
              {/* Column headers */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 100px 100px 100px 100px',
                gap: '0',
                padding: '12px 16px',
                borderBottom: '1px solid var(--mk-border)',
                position: 'sticky',
                top: 0,
                background: 'var(--mk-bg)',
                zIndex: 2,
              }}>
                <span style={{ fontFamily: 'var(--mk-font-m)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--mk-muted)' }}>
                  Feature
                </span>
                {['Gratis', 'Starter', 'Profesional', 'Enterprise'].map(name => (
                  <span key={name} style={{
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: name === 'Profesional' ? 'var(--mk-teal)' : 'var(--mk-text)',
                    textAlign: 'center',
                  }}>
                    {name}
                  </span>
                ))}
              </div>

              {/* Categories */}
              {featureComparison.map(cat => (
                <details key={cat.category} open style={{ borderBottom: '1px solid var(--mk-border)' }}>
                  <summary style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    padding: '14px 16px',
                    background: 'var(--mk-bg-card)',
                    cursor: 'pointer',
                    listStyle: 'none',
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    color: 'var(--mk-text)',
                  }}>
                    <span>{cat.icon} {cat.category}</span>
                  </summary>
                  {cat.features.map((feat, idx) => (
                    <div key={feat.name} style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 100px 100px 100px 100px',
                      gap: '0',
                      padding: '10px 16px',
                      background: idx % 2 === 0 ? 'transparent' : 'rgba(12,21,35,0.5)',
                      borderTop: '1px solid rgba(24,36,56,0.5)',
                      alignItems: 'center',
                    }}>
                      <span style={{ fontSize: '0.83rem', color: 'var(--mk-muted)', paddingRight: '12px' }}>
                        {feat.name}
                      </span>
                      <span style={{ textAlign: 'center' }}>{renderCellValue(feat.free)}</span>
                      <span style={{ textAlign: 'center' }}>{renderCellValue(feat.starter)}</span>
                      <span style={{ textAlign: 'center' }}>{renderCellValue(feat.profesional)}</span>
                      <span style={{ textAlign: 'center' }}>{renderCellValue(feat.enterprise)}</span>
                    </div>
                  ))}
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Add-ons */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container">
          <div style={{ textAlign: 'center', maxWidth: '560px', margin: '0 auto 48px' }}>
            <div className="mk-label" style={{ margin: '0 auto 24px' }}>
              <div className="mk-pulse" />
              M{'\u00f3'}dulos adicionales
            </div>
            <h2 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 'clamp(1.6rem,3.5vw,2.4rem)', fontWeight: 800, color: 'var(--mk-text)', marginBottom: '14px' }}>
              Ampl{'\u00eda'} tu plan con m{'\u00f3'}dulos especializados
            </h2>
            <p style={{ color: 'var(--mk-muted)', fontSize: '0.95rem' }}>
              Disponibles como complemento en cualquier plan pagado. Enterprise incluye todos.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
            {addons.map(a => (
              <div key={a.name} className="mk-card" style={{ padding: 'clamp(20px,3vw,28px)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <span style={{ fontSize: '28px' }}>{a.icon}</span>
                  <span style={{
                    fontFamily: 'var(--mk-font-m)',
                    fontSize: '9px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontWeight: 600,
                    color: tagColors[a.tag],
                    background: tagColors[a.tag] + '18',
                    padding: '3px 8px',
                    borderRadius: '2px',
                  }}>
                    {a.tag}
                  </span>
                </div>
                <h3 style={{ fontFamily: 'var(--mk-font-h)', fontSize: '1rem', fontWeight: 700, color: 'var(--mk-text)', marginBottom: '6px' }}>{a.name}</h3>
                <p style={{ color: 'var(--mk-muted)', fontSize: '0.83rem', lineHeight: 1.6, marginBottom: '12px' }}>{a.desc}</p>
                <span style={{ fontFamily: 'var(--mk-font-m)', fontSize: '11px', color: 'var(--mk-teal)' }}>
                  {a.pricing}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Packs */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container">
          <div style={{ textAlign: 'center', maxWidth: '560px', margin: '0 auto 48px' }}>
            <div className="mk-label" style={{ margin: '0 auto 24px' }}>
              <div className="mk-pulse" />
              Packs
            </div>
            <h2 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 'clamp(1.6rem,3.5vw,2.4rem)', fontWeight: 800, color: 'var(--mk-text)', marginBottom: '14px' }}>
              Packs con descuento
            </h2>
            <p style={{ color: 'var(--mk-muted)', fontSize: '0.95rem' }}>
              Combina m{'\u00f3'}dulos y ahorra.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            {packs.map(p => (
              <div key={p.name} style={{
                background: 'var(--mk-bg-card)',
                border: '1px solid var(--mk-border)',
                borderRadius: '4px',
                padding: 'clamp(20px,3vw,28px)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>{p.icon}</div>
                <h3 style={{ fontFamily: 'var(--mk-font-h)', fontSize: '1rem', fontWeight: 700, color: 'var(--mk-text)', marginBottom: '8px' }}>
                  {p.name}
                </h3>
                <p style={{ color: 'var(--mk-muted)', fontSize: '0.83rem', lineHeight: 1.6, marginBottom: '14px' }}>
                  {p.includes}
                </p>
                <span style={{
                  display: 'inline-block',
                  background: 'var(--mk-orange-dim)',
                  color: 'var(--mk-orange)',
                  fontFamily: 'var(--mk-font-h)',
                  fontWeight: 700,
                  fontSize: '11px',
                  padding: '4px 12px',
                  borderRadius: '2px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  {p.discount}
                </span>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {faq.map(f => (
              <details key={f.q} style={{
                background: 'var(--mk-bg-card)',
                border: '1px solid var(--mk-border)',
                borderRadius: '4px',
              }}>
                <summary style={{
                  padding: 'clamp(16px,3vw,24px)',
                  fontFamily: 'var(--mk-font-h)',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  color: 'var(--mk-text)',
                  cursor: 'pointer',
                  listStyle: 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                }}>
                  <span>{f.q}</span>
                  <span style={{ color: 'var(--mk-muted)', fontSize: '1.2rem', flexShrink: 0, transition: 'transform 0.2s' }}>{'\u25b8'}</span>
                </summary>
                <div style={{ padding: '0 clamp(16px,3vw,24px) clamp(16px,3vw,24px)', borderTop: '1px solid var(--mk-border)' }}>
                  <p style={{ color: 'var(--mk-muted)', fontSize: '0.88rem', lineHeight: 1.7 }}>
                    {f.a}
                  </p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <TrialBanner
        title="Comienza gratis — escala cuando crezcas"
        subtitle="Plan gratis para siempre con hasta 10 guardias. Sin tarjeta de crédito."
      />
    </>
  )
}
