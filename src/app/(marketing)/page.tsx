import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'OPAI — ERP con IA para Empresas de Seguridad Privada | Chile',
  description:
    'El único ERP diseñado exclusivamente para empresas de seguridad privada. 259 modelos, 801 endpoints, 6 portales y 18 automatizaciones con IA operacional real.',
}

const JSON_LD_CONTENT = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'OPAI',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web, iOS, Android',
  description:
    'ERP con inteligencia artificial para empresas de seguridad privada en Chile. Gestión de guardias, rondas GPS, marcaciones, payroll y portal del cliente.',
  url: 'https://opai.cl',
  offers: [
    { '@type': 'Offer', name: 'Starter', price: '0.12', priceCurrency: 'CLF', description: 'Por guardia activo/mes' },
    { '@type': 'Offer', name: 'Operaciones Pro', price: '0.28', priceCurrency: 'CLF', description: 'Por guardia activo/mes' },
    { '@type': 'Offer', name: 'Suite Completa', price: '0.46', priceCurrency: 'CLF', description: 'Por guardia activo/mes' },
  ],
  featureList: [
    'Gestión de guardias de seguridad',
    'Control de rondas GPS',
    'Marcaciones con geolocalización',
    'Payroll Chile LRE',
    'Portal del cliente',
    'Portal del guardia',
    'Facturación electrónica SII',
    'Inteligencia artificial operacional',
    'Face ID con AWS Rekognition',
    'Alertas WhatsApp automáticas',
  ],
  availableOnDevice: ['Desktop', 'Mobile'],
})


/* ---------- data ---------- */

const STATS = [
  { value: '259', label: 'Modelos' },
  { value: '801', label: 'Endpoints' },
  { value: '6', label: 'Portales' },
  { value: '18', label: 'Automatizaciones' },
]

const PROBLEMS = [
  {
    icon: '⚠️',
    title: 'Programación en Excel',
    desc: 'Turnos armados a mano en planillas infinitas. Errores, sobretiempo invisible y cero trazabilidad.',
  },
  {
    icon: '🚨',
    title: 'Puestos descubiertos',
    desc: 'Te enteras del puesto vacío cuando el cliente reclama. Sin alertas, sin plan B automático.',
  },
  {
    icon: '🔗',
    title: 'Sistemas desconectados',
    desc: 'Operaciones en un lado, RRHH en otro, contabilidad en un tercero. Datos duplicados y decisiones a ciegas.',
  },
  {
    icon: '📋',
    title: 'Cumplimiento manual',
    desc: 'OS-10, credenciales, exámenes: todo se rastrea en carpetas. Cualquier vencimiento es un riesgo.',
  },
]

const MODULES = [
  {
    tag: 'Core',
    title: 'Operaciones',
    desc: 'Programación de turnos, cobertura inteligente y control en tiempo real de cada puesto y guardia.',
    features: ['Drag & drop de turnos', 'Alertas cobertura en olas', 'Vista Gantt semanal', 'Gestión de sitios y puestos'],
    slug: 'operaciones',
  },
  {
    tag: 'Campo',
    title: 'Rondas GPS',
    desc: 'Checkpoints NFC/QR con geolocalización y fotos. Desviaciones detectadas en tiempo real.',
    features: ['Checkpoints NFC + QR', 'Mapa en vivo Leaflet', 'Fotos con timestamp', 'Alertas de desviación'],
    slug: 'rondas-gps',
  },
  {
    tag: 'Comercial',
    title: 'CRM',
    desc: 'Pipeline de ventas, cotizaciones y seguimiento de clientes. Todo integrado con operaciones.',
    features: ['Pipeline visual', 'Cotizaciones rápidas', 'Historial de contacto', 'Conversión a contrato'],
    slug: 'crm',
  },
  {
    tag: 'Finanzas',
    title: 'Finanzas',
    desc: 'Facturación electrónica SII, cobranza, reportes de rentabilidad por sitio.',
    features: ['DTE integrado SII', 'Cobranza automatizada', 'Rentabilidad por sitio', 'Flujo de caja'],
    slug: 'finanzas',
  },
  {
    tag: 'RRHH',
    title: 'Payroll',
    desc: 'Nómina de guardias con turnos rotativos, extras y descuentos. Compatible LRE Chile.',
    features: ['Cálculo turnos rotativos', 'Horas extra automáticas', 'Libro de remuneraciones', 'Previred y AFC'],
    slug: 'payroll',
  },
  {
    tag: 'IA',
    title: 'IA Operacional',
    desc: 'Detección de anomalías, predicciones de cobertura y asistente conversacional para operaciones.',
    features: ['Detección de anomalías', 'Predicción de ausentismo', 'Asistente IA', 'Análisis de patrones'],
    slug: 'ia-operacional',
  },
]

const DIFFERENTIATORS = [
  {
    icon: '🧑‍💻',
    title: 'Face ID — AWS Rekognition',
    desc: 'Marcación biométrica facial desde el celular del guardia. Sin hardware adicional, 99.7% precisión.',
  },
  {
    icon: '📍',
    title: 'Geo-fence accuracy-aware',
    desc: 'Radios dinámicos que se adaptan a la precisión GPS real del dispositivo. Menos falsos positivos.',
  },
  {
    icon: '📩',
    title: 'Alertas WhatsApp en olas',
    desc: 'Cobertura: primero el guardia, luego el supervisor, después el jefe de operaciones. Escalonamiento automático.',
  },
  {
    icon: '🧠',
    title: 'Detección de anomalías',
    desc: 'IA que analiza patrones históricos y detecta desviaciones en asistencia, rondas y cumplimiento.',
  },
  {
    icon: '🛡️',
    title: 'Cumplimiento biométrico',
    desc: 'OS-10, credenciales y exámenes rastreados con alertas de vencimiento automáticas.',
  },
  {
    icon: '⚙️',
    title: '18 automatizaciones',
    desc: 'Desde liquidaciones hasta alertas de turno: todo lo repetitivo se ejecuta solo.',
  },
]

const PORTALS = [
  { name: 'ERP Admin', desc: 'Panel completo para jefes de operación, RRHH, finanzas y gerencia.', icon: '🏛️' },
  { name: 'Cliente', desc: 'Dashboard para tus clientes: cobertura, rondas, incidencias y reportes.', icon: '🧑‍💼' },
  { name: 'Guardia', desc: 'App móvil para marcaciones, rondas, documentos y comunicaciones.', icon: '🛡️' },
  { name: 'Supervisor', desc: 'Vista de campo: equipos, cobertura en vivo, alertas y checkpoints.', icon: '📱' },
  { name: 'Marcación', desc: 'Kiosco biométrico con Face ID para entrada y salida de guardias.', icon: '🦾' },
  { name: 'Rondas', desc: 'Interfaz dedicada para rondas con NFC, QR, GPS y fotos.', icon: '📍' },
]

const INTEGRATIONS = [
  { name: 'AWS Rekognition', desc: 'Face ID biométrico' },
  { name: 'Twilio', desc: 'WhatsApp y SMS' },
  { name: 'OpenAI', desc: 'GPT-4o para IA' },
  { name: 'Anthropic', desc: 'Claude para análisis' },
  { name: 'Pusher', desc: 'Tiempo real WebSocket' },
  { name: 'Cloudflare R2', desc: 'Almacenamiento S3' },
  { name: 'Resend', desc: 'Emails transaccionales' },
  { name: 'Leaflet', desc: 'Mapas interactivos' },
  { name: 'pgvector', desc: 'Embeddings en Postgres' },
  { name: 'Playwright', desc: 'PDF y reportes' },
  { name: 'Capacitor', desc: 'Apps nativas iOS/Android' },
  { name: 'Sentry', desc: 'Monitoreo de errores' },
]

const IA_FEATURES = [
  'Análisis predictivo de ausentismo',
  'Detección de anomalías en rondas',
  'Optimización de cobertura automática',
  'Alertas inteligentes con contexto',
  'Asistente conversacional para operadores',
  'Reportes generados con lenguaje natural',
]

const TERMINAL_LINES = [
  { prefix: '❯', text: "opai analyze --turno-noche --site='Las Condes 42'", color: 'var(--mk-teal)' },
  { prefix: '  ✓', text: '142 registros cargados (nov 2024)', color: 'var(--mk-muted)' },
  { prefix: '  ✓', text: 'Modelo anomalía: 3 desviaciones detectadas', color: 'var(--mk-muted)' },
  { prefix: '  !', text: 'Guardia R. Muñoz: 4 ausencias en 12 días (p=0.03)', color: 'var(--mk-orange)' },
  { prefix: '  !', text: 'Ronda Sector B: 23% checkpoints omitidos', color: 'var(--mk-orange)' },
  { prefix: '  ✓', text: 'Recomendación: reasignar + reforzar Sector B', color: 'var(--mk-teal)' },
  { prefix: '  ✓', text: 'Reporte enviado a supervisor vía WhatsApp', color: 'var(--mk-teal)' },
]

/* ---------- shared styles ---------- */

const sectionHeading: React.CSSProperties = {
  fontFamily: 'var(--mk-font-h)',
  fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
  fontWeight: 800,
  color: 'var(--mk-text)',
  lineHeight: 1.1,
  marginBottom: '18px',
}

const sectionSub: React.CSSProperties = {
  color: 'var(--mk-muted)',
  fontSize: 'clamp(0.95rem, 1.5vw, 1.08rem)',
  lineHeight: 1.75,
  maxWidth: '560px',
}

/* ---------- component ---------- */

export default function MarketingPage() {
  return (
    <>
      {/* JSON-LD */}
      {/* eslint-disable-next-line react/no-danger -- Static JSON-LD, no user input */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON_LD_CONTENT }}
      />

      {/* ====== 1. HERO ====== */}
      <section
        className="mk-section"
        style={{
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
          paddingTop: 'clamp(80px, 14vw, 160px)',
          paddingBottom: 'clamp(48px, 8vw, 96px)',
        }}
      >
        {/* glow */}
        <div
          style={{
            position: 'absolute',
            top: '-120px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '700px',
            height: '500px',
            background:
              'radial-gradient(ellipse, rgba(0,212,176,0.07) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div className="mk-container">
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            ERP + IA para seguridad privada
          </div>

          <h1
            style={{
              fontFamily: 'var(--mk-font-h)',
              fontSize: 'clamp(2.2rem, 5.5vw, 4rem)',
              fontWeight: 800,
              color: 'var(--mk-text)',
              lineHeight: 1.08,
              maxWidth: '800px',
              margin: '0 auto 24px',
              letterSpacing: '-0.02em',
            }}
          >
            El ERP que las empresas de seguridad{' '}
            <span style={{ color: 'var(--mk-teal)' }}>necesitaban</span>
          </h1>

          <p
            style={{
              color: 'var(--mk-muted)',
              fontSize: 'clamp(1rem, 1.8vw, 1.15rem)',
              lineHeight: 1.75,
              maxWidth: '580px',
              margin: '0 auto 40px',
            }}
          >
            Operaciones, CRM, Finanzas y Nómina en una sola plataforma.
            Con inteligencia artificial que detecta anomalías, predice
            ausentismo y automatiza lo repetitivo.
          </p>

          {/* CTAs */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '14px',
              flexWrap: 'wrap',
              marginBottom: '14px',
            }}
          >
            <a
              href="https://opai.gard.cl/registro"
              target="_blank"
              rel="noopener noreferrer"
              className="mk-btn-primary"
              style={{ padding: '16px 32px', fontSize: '1rem' }}
            >
              Comenzar gratis — 30 días →
            </a>
            <Link href="/planes" className="mk-btn-ghost">
              Ver planes y precios
            </Link>
          </div>

          <p
            style={{
              fontFamily: 'var(--mk-font-m)',
              fontSize: '11px',
              color: 'var(--mk-muted)',
              letterSpacing: '0.04em',
              marginBottom: '56px',
            }}
          >
            Sin tarjeta de crédito · 30 días gratis · Cancela cuando quieras
          </p>

          {/* Stats bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 'clamp(12px, 2vw, 24px)',
              maxWidth: '640px',
              margin: '0 auto',
              borderTop: '1px solid var(--mk-border)',
              paddingTop: '32px',
            }}
          >
            {STATS.map((s) => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: 'clamp(1.4rem, 3vw, 2rem)',
                    fontWeight: 800,
                    color: 'var(--mk-teal)',
                  }}
                >
                  {s.value}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--mk-font-m)',
                    fontSize: '11px',
                    color: 'var(--mk-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    marginTop: '4px',
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ====== 2. PROBLEMS ====== */}
      <section
        className="mk-section"
        style={{ borderTop: '1px solid var(--mk-border)' }}
      >
        <div className="mk-container">
          <div className="mk-label">
            <div className="mk-pulse" />
            El problema
          </div>
          <h2 style={sectionHeading}>
            ¿Tu operación depende de planillas y WhatsApp?
          </h2>
          <p style={{ ...sectionSub, marginBottom: '48px' }}>
            La mayoría de empresas de seguridad gestiona miles de turnos,
            guardias y clientes con herramientas que no fueron diseñadas para eso.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '20px',
            }}
          >
            {PROBLEMS.map((p) => (
              <div
                key={p.title}
                className="mk-card"
                style={{ padding: 'clamp(24px, 3vw, 32px)' }}
              >
                <div style={{ fontSize: '1.6rem', marginBottom: '14px' }}>
                  {p.icon}
                </div>
                <h3
                  style={{
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    color: 'var(--mk-text)',
                    marginBottom: '10px',
                  }}
                >
                  {p.title}
                </h3>
                <p
                  style={{
                    color: 'var(--mk-muted)',
                    fontSize: '0.9rem',
                    lineHeight: 1.7,
                  }}
                >
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ====== 3. MODULES ====== */}
      <section
        className="mk-section"
        style={{ borderTop: '1px solid var(--mk-border)' }}
      >
        <div className="mk-container">
          <div className="mk-label">
            <div className="mk-pulse" />
            Módulos
          </div>
          <h2 style={sectionHeading}>
            Todo lo que necesitas, en un solo lugar
          </h2>
          <p style={{ ...sectionSub, marginBottom: '48px' }}>
            6 módulos diseñados específicamente para seguridad privada.
            Sin integraciones frágiles, sin datos duplicados.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: '20px',
            }}
          >
            {MODULES.map((m) => (
              <Link
                key={m.slug}
                href={`/funcionalidades/${m.slug}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div
                  className="mk-card"
                  style={{
                    padding: 'clamp(24px, 3vw, 32px)',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--mk-font-m)',
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.14em',
                      color: 'var(--mk-teal)',
                      background: 'var(--mk-teal-dim)',
                      border: '1px solid var(--mk-teal-glow)',
                      padding: '3px 10px',
                      borderRadius: '2px',
                      alignSelf: 'flex-start',
                      marginBottom: '16px',
                    }}
                  >
                    {m.tag}
                  </span>
                  <h3
                    style={{
                      fontFamily: 'var(--mk-font-h)',
                      fontSize: '1.2rem',
                      fontWeight: 700,
                      color: 'var(--mk-text)',
                      marginBottom: '10px',
                    }}
                  >
                    {m.title}
                  </h3>
                  <p
                    style={{
                      color: 'var(--mk-muted)',
                      fontSize: '0.9rem',
                      lineHeight: 1.7,
                      marginBottom: '18px',
                    }}
                  >
                    {m.desc}
                  </p>
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: '0',
                      marginTop: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    {m.features.map((f) => (
                      <li
                        key={f}
                        style={{
                          fontFamily: 'var(--mk-font-m)',
                          fontSize: '0.8rem',
                          color: 'var(--mk-muted)',
                          paddingLeft: '18px',
                          position: 'relative',
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            left: 0,
                            color: 'var(--mk-teal)',
                          }}
                        >
                          ✓
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ====== 4. DIFFERENTIATORS ====== */}
      <section
        className="mk-section"
        style={{ borderTop: '1px solid var(--mk-border)' }}
      >
        <div className="mk-container">
          <div className="mk-label">
            <div className="mk-pulse" />
            Diferenciadores
          </div>
          <h2 style={sectionHeading}>
            Tecnología que no encontrarás en otro ERP
          </h2>
          <p style={{ ...sectionSub, marginBottom: '48px' }}>
            Construido desde cero para seguridad privada, no adaptado de un
            ERP genérico.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '20px',
            }}
          >
            {DIFFERENTIATORS.map((d) => (
              <div
                key={d.title}
                className="mk-card"
                style={{ padding: 'clamp(24px, 3vw, 32px)' }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '14px' }}>
                  {d.icon}
                </div>
                <h3
                  style={{
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    color: 'var(--mk-text)',
                    marginBottom: '10px',
                  }}
                >
                  {d.title}
                </h3>
                <p
                  style={{
                    color: 'var(--mk-muted)',
                    fontSize: '0.9rem',
                    lineHeight: 1.7,
                  }}
                >
                  {d.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ====== 5. IA OPERACIONAL ====== */}
      <section
        className="mk-section"
        style={{ borderTop: '1px solid var(--mk-border)' }}
      >
        <div className="mk-container">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: 'clamp(32px, 5vw, 64px)',
              alignItems: 'center',
            }}
          >
            {/* Left: features */}
            <div>
              <div className="mk-label">
                <div className="mk-pulse" />
                IA Operacional
              </div>
              <h2 style={sectionHeading}>
                Inteligencia artificial que{' '}
                <span style={{ color: 'var(--mk-teal)' }}>entiende</span> tu
                operación
              </h2>
              <p style={{ ...sectionSub, marginBottom: '32px' }}>
                No es un chatbot genérico. Es IA entrenada con datos reales
                de operaciones de seguridad privada.
              </p>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                {IA_FEATURES.map((feat) => (
                  <li
                    key={feat}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      color: 'var(--mk-text)',
                      fontSize: '0.95rem',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: 'var(--mk-teal-dim)',
                        color: 'var(--mk-teal)',
                        fontSize: '12px',
                        flexShrink: 0,
                      }}
                    >
                      ✓
                    </span>
                    {feat}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right: terminal visual */}
            <div
              style={{
                background: 'var(--mk-bg-card)',
                border: '1px solid var(--mk-border)',
                borderRadius: '6px',
                overflow: 'hidden',
              }}
            >
              {/* terminal bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 16px',
                  background: 'rgba(0,0,0,0.3)',
                  borderBottom: '1px solid var(--mk-border)',
                }}
              >
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#FF5F56',
                  }}
                />
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#FFBD2E',
                  }}
                />
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#27CA40',
                  }}
                />
                <span
                  style={{
                    fontFamily: 'var(--mk-font-m)',
                    fontSize: '11px',
                    color: 'var(--mk-muted)',
                    marginLeft: '8px',
                  }}
                >
                  opai-ia — análisis control nocturno
                </span>
              </div>
              {/* terminal content */}
              <div
                style={{
                  padding: 'clamp(16px, 2vw, 24px)',
                  fontFamily: 'var(--mk-font-m)',
                  fontSize: 'clamp(11px, 1.2vw, 13px)',
                  lineHeight: 2,
                  overflowX: 'auto',
                }}
              >
                {TERMINAL_LINES.map((line, i) => (
                  <div key={i} style={{ whiteSpace: 'nowrap' }}>
                    <span style={{ color: line.color }}>{line.prefix}</span>{' '}
                    <span style={{ color: line.color }}>{line.text}</span>
                  </div>
                ))}
                <div style={{ marginTop: '8px' }}>
                  <span style={{ color: 'var(--mk-teal)' }}>❯</span>{' '}
                  <span
                    style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '16px',
                      background: 'var(--mk-teal)',
                      animation: 'mk-pulse 1s infinite',
                      verticalAlign: 'middle',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====== 6. PORTALS ====== */}
      <section
        className="mk-section"
        style={{ borderTop: '1px solid var(--mk-border)' }}
      >
        <div className="mk-container">
          <div className="mk-label">
            <div className="mk-pulse" />
            6 Portales
          </div>
          <h2 style={sectionHeading}>
            Un portal para cada rol
          </h2>
          <p style={{ ...sectionSub, marginBottom: '48px' }}>
            Cada usuario accede solo a lo que necesita. Menos complejidad,
            más adopción.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '20px',
            }}
          >
            {PORTALS.map((p) => (
              <div
                key={p.name}
                className="mk-card"
                style={{ padding: 'clamp(24px, 3vw, 32px)' }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '14px' }}>
                  {p.icon}
                </div>
                <h3
                  style={{
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    color: 'var(--mk-text)',
                    marginBottom: '10px',
                  }}
                >
                  Portal {p.name}
                </h3>
                <p
                  style={{
                    color: 'var(--mk-muted)',
                    fontSize: '0.9rem',
                    lineHeight: 1.7,
                  }}
                >
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ====== 7. INTEGRATIONS ====== */}
      <section
        className="mk-section"
        style={{ borderTop: '1px solid var(--mk-border)' }}
      >
        <div className="mk-container">
          <div className="mk-label">
            <div className="mk-pulse" />
            Integraciones
          </div>
          <h2 style={sectionHeading}>
            Conectado con lo mejor del ecosistema
          </h2>
          <p style={{ ...sectionSub, marginBottom: '48px' }}>
            Servicios de clase mundial integrados nativamente. Sin plugins,
            sin configuración manual.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '16px',
            }}
          >
            {INTEGRATIONS.map((integ) => (
              <div
                key={integ.name}
                className="mk-card"
                style={{
                  padding: '20px',
                  textAlign: 'center',
                }}
              >
                <h4
                  style={{
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    color: 'var(--mk-text)',
                    marginBottom: '6px',
                  }}
                >
                  {integ.name}
                </h4>
                <p
                  style={{
                    fontFamily: 'var(--mk-font-m)',
                    fontSize: '11px',
                    color: 'var(--mk-muted)',
                    letterSpacing: '0.02em',
                  }}
                >
                  {integ.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ====== 8. TRIAL BANNER ====== */}
      <TrialBanner />
    </>
  )
}
