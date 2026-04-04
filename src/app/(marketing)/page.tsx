import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'OPAI — ERP con IA para Empresas de Seguridad Privada | Chile',
  description: 'El único ERP diseñado exclusivamente para empresas de seguridad privada. Gestiona guardias, rondas GPS, CRM, finanzas y nómina. Con Face ID biométrico, alertas WhatsApp y IA operacional.',
  alternates: { canonical: 'https://www.opai.cl' },
  openGraph: {
    title: 'OPAI — ERP con IA para Empresas de Seguridad Privada',
    description: 'Face ID, rondas GPS, alertas WhatsApp automáticas. Todo en un sistema.',
    url: 'https://www.opai.cl',
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'OPAI',
  applicationCategory: 'BusinessApplication',
  description: 'ERP especializado para empresas de seguridad privada en Chile. Incluye gestión de guardias, rondas GPS, CRM, finanzas y nómina con inteligencia artificial.',
  url: 'https://www.opai.cl',
  operatingSystem: 'Web, iOS, Android',
  offers: { '@type': 'Offer', priceCurrency: 'CLP', price: '0', availability: 'https://schema.org/InStock' },
  creator: { '@type': 'Organization', name: 'LX3.ai', url: 'https://lx3.ai' },
}

const stats = [
  { num: '259', label: 'Modelos de datos' },
  { num: '801', label: 'Endpoints API' },
  { num: '6', label: 'Portales especializados' },
  { num: '18', label: 'Automatizaciones 24/7' },
]

const problems = [
  { title: 'Pautas y marcaciones en Excel', desc: 'Planillas que se duplican, errores manuales y sin visibilidad de qué guardia cubre qué puesto en tiempo real.' },
  { title: 'Puestos que quedan sin cobertura', desc: 'Cuando un guardia falta, el reemplazo es un proceso manual y lento. Sin alertas automáticas ni seguimiento.' },
  { title: 'Sistemas desconectados', desc: 'CRM en un lado, operaciones en otro, nómina en Excel. Sin una vista unificada del negocio de seguridad.' },
  { title: 'Compliance laboral manual', desc: 'Liquidaciones, contratos, documentos con vencimiento. Gestión manual que genera riesgos de multas DT.' },
]

const modules = [
  { tag: 'Operaciones', title: 'Gestión de Guardias', desc: 'Fichas OS10 completas, pautas mensuales drag-drop, marcaciones GPS/Face ID y cobertura automatizada.', href: '/funcionalidades/operaciones', features: ['Pautas con series de asignación', 'Marcación GPS, QR, PIN o Face ID', 'Alertas WhatsApp ante cobertura fallida', 'Rondas con anomaly detection'] },
  { tag: 'Supervisión', title: 'Rondas GPS Inteligentes', desc: 'Checkpoints QR/GPS con monitoreo en tiempo real. Trust Score 0-100 por checkpoint. Reportes automáticos.', href: '/funcionalidades/rondas-gps', features: ['Geo-fence accuracy-aware', 'Anomaly detection: velocidad, tiempo, geo', 'Trust Score automático 0-100', 'Resumen nocturno con IA'] },
  { tag: 'CRM + CPQ', title: 'CRM Comercial', desc: 'Pipeline completo, cotizaciones con PDF Playwright, propuestas interactivas y follow-up automático por email.', href: '/funcionalidades/crm-comercial', features: ['Pipeline configurable', 'Cotizaciones PDF Playwright', 'Follow-up automático', 'Enriquecimiento de leads IA'] },
  { tag: 'Finanzas', title: 'Finanzas & Facturación', desc: 'Contabilidad de partida doble, DTE electrónico, conciliación bancaria automática y factoring integrado.', href: '/funcionalidades/finanzas', features: ['DTE con estado SII', 'Conciliación bancaria automática', 'Rendiciones multi-nivel', 'Factoring de facturas'] },
  { tag: 'Nómina', title: 'Payroll Chileno', desc: 'Liquidaciones según ley vigente, estructuras salariales, simulador de remuneraciones y exportación Excel.', href: '/funcionalidades/finanzas', features: ['Liquidaciones individuales', 'Compliance Res. N°38', 'Simulador de remuneraciones', 'Exportación Excel'] },
  { tag: 'IA', title: 'IA Operacional Real', desc: 'RAG semántico, OCR de patentes y MRZ, análisis de rondas nocturnas, frustration detection automático.', href: '/funcionalidades/ia-operacional', features: ['Help Chat con RAG + pgvector', 'OCR multi-proveedor (OpenAI + Claude)', 'Análisis nocturno con contexto 7 días', 'Frustration detection (35+ patrones)'] },
]

const diffs = [
  { num: '01', title: 'Face ID con AWS Rekognition', desc: 'Marcaciones verificadas biométricamente. Threshold 95%, quality checks en tiempo real. No solo GPS — confirmación de que el guardia correcto se presentó.' },
  { num: '02', title: 'Geo-fence accuracy-aware', desc: 'La tolerancia se ajusta automáticamente según la precisión GPS real del dispositivo. Menos falsos positivos, más confiabilidad.' },
  { num: '03', title: 'Alertas WhatsApp en oleadas', desc: 'Cuando un puesto queda sin cobertura, OPAI envía WhatsApp a pools de guardias disponibles en oleadas escalonadas — con tracking de aceptación.' },
  { num: '04', title: 'Anomaly detection en rondas', desc: 'Trust Score 0-100 por checkpoint. Detecta velocidad anormal, violaciones de geo-fence y tiempo fuera de rango — automáticamente.' },
  { num: '05', title: 'Compliance biométrico automático', desc: 'Destrucción automática de datos faciales 90-120 días post-término. Cumplimiento Resolución N°38 DT sin intervención manual.' },
  { num: '06', title: '18 automatizaciones corriendo siempre', desc: 'Rondas generadas, alertas escaladas, documentos notificados, payroll procesado. Todo automatizado — tu operación no descansa.' },
]

const aiFeatures = [
  { title: 'Help Chat con RAG semántico', desc: 'Busca en documentación indexada con embeddings (pgvector). Escala de gpt-4o-mini a gpt-4o cuando detecta frustración.' },
  { title: 'Control Nocturno inteligente', desc: 'Analiza compliance de rondas y genera resumen ejecutivo con 7 días de contexto histórico para el supervisor.' },
  { title: 'OCR multi-proveedor', desc: 'Lee placas patente y zona MRZ de documentos. OpenAI primero, Claude como fallback — siempre funciona.' },
  { title: 'CRM enrichment automático', desc: 'Enriquece notas de leads e infiere costos de proyecto desde datos del prospecto. Sin esfuerzo manual.' },
]

const portals = [
  { icon: '\u{1F3E2}', title: 'ERP Admin', desc: 'Gestión completa para owners, admins y editores.', route: '/opai/*', color: 'var(--mk-teal)' },
  { icon: '\u{1F454}', title: 'Portal Cliente', desc: 'Guardias activos, rondas e incidentes.', route: '/portal/cliente', color: '#7B8FFF' },
  { icon: '\u{1F6E1}', title: 'Portal Guardia', desc: 'Marcaciones, liquidaciones y chat.', route: '/portal/guardia', color: '#FF9050' },
  { icon: '\u{1F4CB}', title: 'Portal Supervisor', desc: 'Visitas de campo y evaluaciones.', route: '/portal/supervisor', color: '#FF5A7E' },
  { icon: '\u{1F4CD}', title: 'Portal Marcación', desc: 'Kiosco de entrada/salida PIN o QR.', route: '/portal/marcacion', color: '#42E07D' },
  { icon: '\u{1F5FA}', title: 'Portal Rondas', desc: 'Mapa con checkpoints en tiempo real.', route: '/portal/rondas', color: '#FFCA30' },
]

const integrations = [
  { name: 'AWS Rekognition', tag: 'Face ID' },
  { name: 'Twilio', tag: 'WhatsApp' },
  { name: 'OpenAI', tag: 'IA' },
  { name: 'Anthropic', tag: 'IA fallback' },
  { name: 'Pusher', tag: 'Real-time' },
  { name: 'Cloudflare R2', tag: 'Storage' },
  { name: 'Resend', tag: 'Email' },
  { name: 'Leaflet', tag: 'Mapas GPS' },
  { name: 'pgvector', tag: 'RAG/IA' },
  { name: 'Playwright', tag: 'PDF' },
  { name: 'Capacitor', tag: 'iOS/Android' },
  { name: 'Sentry', tag: 'Monitoring' },
]

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* HERO */}
      <section style={{ padding: 'clamp(80px,12vw,160px) 0 clamp(60px,8vw,100px)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-200px', left: '50%', transform: 'translateX(-50%)', width: '700px', height: '500px', background: 'radial-gradient(ellipse, rgba(0,212,176,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div className="mk-container">
          <div className="mk-label"><div className="mk-pulse" />ERP Seguridad Privada · Chile · Con IA Real</div>
          <h1 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 'clamp(2.4rem, 6vw, 4.8rem)', fontWeight: 900, lineHeight: 1.05, color: 'var(--mk-text)', maxWidth: '820px', marginBottom: '24px', letterSpacing: '-0.02em' }}>
            El ERP para empresas de{' '}<span style={{ color: 'var(--mk-teal)' }}>seguridad privada</span>{' '}con inteligencia artificial
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 2vw, 1.2rem)', color: 'var(--mk-muted)', maxWidth: '560px', lineHeight: 1.75, marginBottom: '40px' }}>
            Gestiona guardias, rondas GPS, CRM, finanzas y nómina en un único sistema diseñado exclusivamente para empresas de seguridad. Con Face ID biométrico, alertas WhatsApp y IA operacional real.
          </p>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <a href="https://opai.gard.cl/registro" target="_blank" rel="noopener noreferrer" className="mk-btn-primary">Comenzar gratis — 30 días →</a>
            <Link href="/planes" className="mk-btn-ghost">Ver planes y precios</Link>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--mk-muted)', marginBottom: '64px', fontFamily: 'var(--mk-font-m)' }}>
            Sin tarjeta de crédito &nbsp;·&nbsp; 30 días gratis &nbsp;·&nbsp; Cancela cuando quieras
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', border: '1px solid var(--mk-border)', background: 'var(--mk-bg-card)', borderRadius: '4px', overflow: 'hidden' }}>
            {stats.map((s, i) => (
              <div key={s.label} style={{ padding: 'clamp(18px,3vw,28px) 20px', borderRight: i < stats.length - 1 ? '1px solid var(--mk-border)' : 'none', textAlign: 'center' }}>
                <span style={{ fontFamily: 'var(--mk-font-m)', fontSize: 'clamp(1.6rem,3vw,2.4rem)', fontWeight: 700, color: 'var(--mk-teal)', display: 'block', lineHeight: 1, marginBottom: '6px' }}>{s.num}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--mk-muted)', fontFamily: 'var(--mk-font-m)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROBLEMS */}
      <section className="mk-section">
        <div className="mk-container">
          <div style={{ maxWidth: '640px', marginBottom: '56px' }}>
            <div className="mk-label"><div className="mk-pulse" />El problema</div>
            <h2 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 800, color: 'var(--mk-text)', marginBottom: '16px' }}>¿Cómo administras tu empresa de seguridad hoy?</h2>
            <p style={{ color: 'var(--mk-muted)', fontSize: '1.05rem', lineHeight: 1.7 }}>Las empresas de seguridad privada siguen operando con herramientas genéricas que no entienden el negocio.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1px', background: 'var(--mk-border)', border: '1px solid var(--mk-border)', borderRadius: '4px', overflow: 'hidden' }}>
            {problems.map(p => (
              <div key={p.title} className="mk-card" style={{ padding: 'clamp(24px,4vw,36px)', borderRadius: 0, border: 'none', background: 'var(--mk-bg-card)' }}>
                <div style={{ width: '40px', height: '40px', background: 'var(--mk-orange-dim)', border: '1px solid rgba(255,90,53,0.2)', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '18px' }}>
                  <div style={{ width: '20px', height: '20px', background: 'var(--mk-orange)', borderRadius: '2px', opacity: 0.8 }} />
                </div>
                <h3 style={{ fontFamily: 'var(--mk-font-h)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--mk-text)', marginBottom: '10px' }}>{p.title}</h3>
                <p style={{ color: 'var(--mk-muted)', fontSize: '0.88rem', lineHeight: 1.7 }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MODULES */}
      <section className="mk-section" id="funcionalidades">
        <div className="mk-container">
          <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto 56px' }}>
            <div className="mk-label"><div className="mk-pulse" />Módulos del sistema</div>
            <h2 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 800, color: 'var(--mk-text)', marginBottom: '16px' }}>Todo lo que necesita una empresa de seguridad privada</h2>
            <p style={{ color: 'var(--mk-muted)', fontSize: '1.05rem' }}>27 módulos completos. Un único sistema. Sin integraciones parcheadas.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            {modules.map(m => (
              <Link key={m.title} href={m.href} style={{ textDecoration: 'none' }}>
                <div className="mk-card" style={{ padding: 'clamp(24px,3vw,32px)', height: '100%', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: '60%', height: '2px', background: 'var(--mk-teal)' }} />
                  <span style={{ fontFamily: 'var(--mk-font-m)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--mk-teal)', marginBottom: '14px', display: 'block' }}>{m.tag}</span>
                  <h3 style={{ fontFamily: 'var(--mk-font-h)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--mk-text)', marginBottom: '10px' }}>{m.title}</h3>
                  <p style={{ color: 'var(--mk-muted)', fontSize: '0.88rem', lineHeight: 1.65, marginBottom: '18px' }}>{m.desc}</p>
                  <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    {m.features.map(f => (
                      <li key={f} style={{ display: 'flex', gap: '8px', fontSize: '0.82rem', color: 'var(--mk-muted)', alignItems: 'flex-start' }}>
                        <span style={{ color: 'var(--mk-teal)', flexShrink: 0, fontWeight: 700 }}>→</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* DIFFERENTIATORS */}
      <section className="mk-section" style={{ background: 'var(--mk-bg-card)', borderTop: '1px solid var(--mk-border)', borderBottom: '1px solid var(--mk-border)' }}>
        <div className="mk-container">
          <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto 56px' }}>
            <div className="mk-label"><div className="mk-pulse" />Por qué OPAI</div>
            <h2 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 800, color: 'var(--mk-text)', marginBottom: '16px' }}>Tecnología que ningún ERP genérico tiene</h2>
            <p style={{ color: 'var(--mk-muted)', fontSize: '1.05rem' }}>Construido desde adentro para el modelo de negocio de seguridad privada.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'clamp(28px,5vw,56px) clamp(24px,5vw,80px)' }}>
            {diffs.map(d => (
              <div key={d.num} style={{ display: 'flex', gap: '20px' }}>
                <span style={{ fontFamily: 'var(--mk-font-m)', fontSize: 'clamp(2rem,3vw,3rem)', fontWeight: 800, color: 'var(--mk-border)', lineHeight: 1, flexShrink: 0, minWidth: '52px' }}>{d.num}</span>
                <div>
                  <h3 style={{ fontFamily: 'var(--mk-font-h)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--mk-text)', marginBottom: '8px' }}>{d.title}</h3>
                  <p style={{ color: 'var(--mk-muted)', fontSize: '0.88rem', lineHeight: 1.65 }}>{d.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* IA OPERACIONAL */}
      <section className="mk-section" id="ia">
        <div className="mk-container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'clamp(32px,6vw,80px)', alignItems: 'start' }}>
            <div>
              <div className="mk-label"><div className="mk-pulse" />IA Operacional</div>
              <h2 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 800, color: 'var(--mk-text)', marginBottom: '16px' }}>IA real. No un chatbot de marketing.</h2>
              <p style={{ color: 'var(--mk-muted)', fontSize: '1rem', lineHeight: 1.75, marginBottom: '36px' }}>La inteligencia artificial de OPAI está integrada en los flujos operativos. Cada módulo de IA afecta decisiones reales — sin tomar decisiones financieras automáticas.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {aiFeatures.map(f => (
                  <div key={f.title} style={{ display: 'flex', gap: '14px', padding: '18px 20px', background: 'var(--mk-bg-card)', border: '1px solid var(--mk-border)', borderRadius: '4px' }}>
                    <div style={{ width: '8px', height: '8px', background: 'var(--mk-teal)', borderRadius: '50%', flexShrink: 0, marginTop: '5px' }} />
                    <div>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--mk-text)', display: 'block', marginBottom: '3px', fontFamily: 'var(--mk-font-h)', fontWeight: 600 }}>{f.title}</strong>
                      <span style={{ fontSize: '0.82rem', color: 'var(--mk-muted)' }}>{f.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/funcionalidades/ia-operacional" className="mk-btn-ghost" style={{ marginTop: '28px', display: 'inline-flex' }}>Ver funcionalidades de IA →</Link>
            </div>

            {/* Terminal */}
            <div style={{ background: '#040B14', border: '1px solid var(--mk-border)', borderRadius: '4px', overflow: 'hidden', fontFamily: 'var(--mk-font-m)', fontSize: 'clamp(0.75rem,1.5vw,0.82rem)' }}>
              <div style={{ background: 'var(--mk-bg-card)', borderBottom: '1px solid var(--mk-border)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#FF5A5A' }} />
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#FFCA30' }} />
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#42E07D' }} />
                <span style={{ color: 'var(--mk-muted)', fontSize: '11px', marginLeft: '8px' }}>control-nocturno — resumen IA · OPAI</span>
              </div>
              <div style={{ padding: 'clamp(16px,3vw,28px)', display: 'flex', flexDirection: 'column', gap: '9px', lineHeight: 1.5 }}>
                <div style={{ color: '#6888AA' }}><span style={{ color: 'var(--mk-teal)' }}>análisis</span> <span style={{ color: '#A8D8FF' }}>Costanera Center</span></div>
                <div style={{ color: '#6888AA' }}><span style={{ color: 'var(--mk-teal)' }}>turno</span> <span style={{ color: '#A8D8FF' }}>22:00 – 06:00</span></div>
                <div style={{ color: '#6888AA' }}>―――――――――――――――――</div>
                <div><span style={{ color: '#42E07D' }}>✓</span> <span style={{ color: '#6888AA' }}>rondas_completadas </span><span style={{ color: '#FF9050' }}>8/8</span></div>
                <div><span style={{ color: '#42E07D' }}>✓</span> <span style={{ color: '#6888AA' }}>trust_score_prom </span><span style={{ color: '#FF9050' }}>94.2</span></div>
                <div><span style={{ color: '#FFCA30' }}>⚠</span> <span style={{ color: '#6888AA' }}>checkpoint_C7 anomalía</span></div>
                <div style={{ color: '#3A4A5E', paddingLeft: '14px' }}>velocidad: 28 km/h {'>'} 15 km/h</div>
                <div style={{ color: '#3A4A5E', paddingLeft: '14px' }}>registrado en audit trail</div>
                <div style={{ color: '#6888AA' }}>―――――――――――――――――</div>
                <div style={{ color: '#6888AA' }}><span style={{ color: '#3A4A5E' }}># contexto 7 días</span></div>
                <div><span style={{ color: 'var(--mk-teal)' }}>tendencia_cobertura </span><span style={{ color: '#42E07D' }}>↑ +3.1%</span></div>
                <div><span style={{ color: 'var(--mk-teal)' }}>incidentes_semana </span><span style={{ color: '#A8D8FF' }}>1</span><span style={{ color: '#3A4A5E' }}> vs 3 anterior</span></div>
                <div style={{ color: '#6888AA' }}>―――――――――――――――――</div>
                <div style={{ color: 'var(--mk-teal)', fontWeight: 500 }}>► resumen_ejecutivo generado</div>
                <div style={{ color: '#3A4A5E' }}>&nbsp;&nbsp;enviado a supervisor · 06:01 AM</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PORTALS */}
      <section className="mk-section" style={{ background: 'var(--mk-bg-card)', borderTop: '1px solid var(--mk-border)', borderBottom: '1px solid var(--mk-border)' }}>
        <div className="mk-container">
          <div style={{ textAlign: 'center', maxWidth: '600px', margin: '0 auto 56px' }}>
            <div className="mk-label"><div className="mk-pulse" />Portales especializados</div>
            <h2 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 800, color: 'var(--mk-text)', marginBottom: '16px' }}>Cada actor tiene su propio acceso</h2>
            <p style={{ color: 'var(--mk-muted)', fontSize: '1.05rem' }}>6 portales con autenticación independiente, diseñados para el flujo de cada usuario.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            {portals.map(p => (
              <div key={p.title} style={{ background: 'var(--mk-bg)', border: '1px solid var(--mk-border)', borderRadius: '4px', padding: 'clamp(20px,3vw,28px)', position: 'relative', overflow: 'hidden', transition: 'border-color 0.2s' }}>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: p.color }} />
                <div style={{ fontSize: '28px', marginBottom: '14px' }}>{p.icon}</div>
                <h3 style={{ fontFamily: 'var(--mk-font-h)', fontWeight: 700, fontSize: '1rem', color: 'var(--mk-text)', marginBottom: '8px' }}>{p.title}</h3>
                <p style={{ color: 'var(--mk-muted)', fontSize: '0.83rem', marginBottom: '14px' }}>{p.desc}</p>
                <code style={{ fontFamily: 'var(--mk-font-m)', fontSize: '10px', color: 'var(--mk-muted)', background: 'var(--mk-bg-card)', border: '1px solid var(--mk-border)', padding: '3px 8px', borderRadius: '2px' }}>{p.route}</code>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INTEGRATIONS */}
      <section className="mk-section">
        <div className="mk-container">
          <div style={{ textAlign: 'center', maxWidth: '560px', margin: '0 auto 48px' }}>
            <div className="mk-label"><div className="mk-pulse" />Integraciones</div>
            <h2 style={{ fontFamily: 'var(--mk-font-h)', fontSize: 'clamp(1.6rem,3.5vw,2.4rem)', fontWeight: 800, color: 'var(--mk-text)', marginBottom: '14px' }}>Conectado con el mejor ecosistema tecnológico</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
            {integrations.map(i => (
              <div key={i.name} style={{ background: 'var(--mk-bg-card)', border: '1px solid var(--mk-border)', borderRadius: '4px', padding: '16px 12px', textAlign: 'center', transition: 'border-color 0.2s' }}>
                <span style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, color: 'var(--mk-text)', marginBottom: '4px', fontFamily: 'var(--mk-font-h)' }}>{i.name}</span>
                <span style={{ fontSize: '10px', color: 'var(--mk-muted)', fontFamily: 'var(--mk-font-m)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{i.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <TrialBanner />
    </>
  )
}
