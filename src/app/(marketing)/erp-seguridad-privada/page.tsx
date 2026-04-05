import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'ERP para Seguridad Privada en Chile | OPAI — Software Especializado',
  description:
    'OPAI es el ERP especializado para empresas de seguridad privada en Chile. 259 modelos, 801 endpoints, Face ID, rondas GPS, alertas WhatsApp, IA operacional y cumplimiento Resolución N°38 DT.',
  alternates: { canonical: 'https://www.opai.cl/erp-seguridad-privada' },
  openGraph: {
    title: 'ERP para Seguridad Privada en Chile | OPAI',
    description:
      'El único ERP construido exclusivamente para empresas de seguridad privada. Face ID, GPS, IA, WhatsApp y compliance chileno.',
    url: 'https://www.opai.cl/erp-seguridad-privada',
  },
}

const features = [
  {
    icon: '🛡',
    title: 'Gestión de Guardias',
    description:
      'Administra perfiles, certificaciones OS10, contratos, turnos y documentación de todo tu personal de seguridad desde un solo lugar.',
  },
  {
    icon: '📍',
    title: 'Rondas GPS en Tiempo Real',
    description:
      'Checkpoints con geofence, Trust Score 0-100 con detección de anomalías por IA y monitoreo en vivo con mapas Leaflet.',
  },
  {
    icon: '👤',
    title: 'Face ID Biométrico',
    description:
      'Marcaciones con reconocimiento facial AWS Rekognition al 95% de confianza. Sin contacto, sin fraude, sin excusas.',
  },
  {
    icon: '💬',
    title: 'Alertas WhatsApp',
    description:
      'Sistema de cobertura con alertas en olas vía Twilio WhatsApp. El cliente correcto recibe la alerta correcta en el momento correcto.',
  },
  {
    icon: '🤖',
    title: 'IA Operacional',
    description:
      'OpenAI gpt-4o con fallback Claude. RAG para help chat, OCR de documentos, detección de frustración y enriquecimiento CRM.',
  },
  {
    icon: '📊',
    title: 'Finanzas y Nómina',
    description:
      'Payroll Chile con LRE, facturación electrónica SII, cotizaciones, control de costos y reporting financiero automatizado.',
  },
  {
    icon: '🌐',
    title: '6 Portales Especializados',
    description:
      'Admin, Operaciones, RRHH, Finanzas, Cliente y Guardia. Cada rol ve exactamente lo que necesita, nada más.',
  },
  {
    icon: '⚙',
    title: '18 Automatizaciones',
    description:
      'Cron jobs para alertas de cobertura, vencimientos, sincronización de datos, reportes automáticos y más. Funcionan 24/7.',
  },
]

const comparisons = [
  {
    feature: 'Rondas GPS con Trust Score',
    opai: 'Incluido con IA',
    generic: 'No disponible',
  },
  {
    feature: 'Face ID biométrico (AWS Rekognition)',
    opai: 'Incluido, 95% threshold',
    generic: 'Plugin externo o no disponible',
  },
  {
    feature: 'Alertas WhatsApp en olas',
    opai: 'Automatizado por Twilio',
    generic: 'Manual o email',
  },
  {
    feature: 'Cumplimiento Resolución N°38 DT',
    opai: 'Nativo',
    generic: 'Requiere customización',
  },
  {
    feature: 'Portal del guardia (móvil)',
    opai: 'App iOS/Android nativa',
    generic: 'No disponible',
  },
  {
    feature: 'IA operacional (RAG, OCR, análisis)',
    opai: 'gpt-4o + Claude fallback',
    generic: 'No disponible',
  },
  {
    feature: 'Payroll Chile con LRE',
    opai: 'Nativo',
    generic: 'Adaptación genérica',
  },
  {
    feature: 'Tiempo de implementación',
    opai: '1 día',
    generic: '3-6 meses',
  },
]

const faqs = [
  {
    q: '¿Qué es un ERP para seguridad privada?',
    a: 'Un ERP para seguridad privada es un sistema de planificación de recursos empresariales diseñado específicamente para gestionar las operaciones de empresas de vigilancia y guardias. OPAI cubre operaciones, RRHH, finanzas, CRM y compliance en una sola plataforma.',
  },
  {
    q: '¿OPAI cumple con la Resolución N°38 de la Dirección del Trabajo?',
    a: 'Sí. OPAI fue diseñado con cumplimiento nativo de la Resolución N°38 DT, incluyendo registro de asistencia electrónico, control de jornada y reportes para fiscalización.',
  },
  {
    q: '¿Qué diferencia a OPAI de un ERP genérico como SAP u Odoo?',
    a: 'OPAI fue construido desde cero para seguridad privada. Incluye Face ID, rondas GPS con Trust Score, alertas WhatsApp, portales especializados y nómina Chile — funcionalidades que un ERP genérico no ofrece o requiere meses de customización.',
  },
  {
    q: '¿Cuántos guardias puede gestionar OPAI?',
    a: 'OPAI escala desde empresas con 10 guardias hasta operaciones con miles. La arquitectura soporta 259 modelos Prisma y 801 endpoints API optimizados para alta concurrencia.',
  },
  {
    q: '¿OPAI funciona en dispositivos móviles?',
    a: 'Sí. OPAI tiene una app nativa para iOS y Android (Capacitor) que permite a los guardias marcar asistencia con Face ID, registrar rondas GPS y recibir notificaciones en tiempo real.',
  },
  {
    q: '¿Cómo funciona la inteligencia artificial en OPAI?',
    a: 'OPAI utiliza OpenAI gpt-4o como motor principal con Claude como fallback. La IA potencia el help chat con RAG (pgvector), OCR de documentos, análisis de anomalías en rondas, detección de frustración en conversaciones y enriquecimiento automático de CRM.',
  },
  {
    q: '¿Puedo probar OPAI antes de comprometerme?',
    a: 'Por supuesto. Ofrecemos 30 días gratis sin tarjeta de crédito. Puedes crear tu cuenta en 2 minutos y comenzar a operar inmediatamente.',
  },
  {
    q: '¿Quién desarrolló OPAI?',
    a: 'OPAI fue creado por LX3.ai, con un equipo fundador que tiene más de 15 años de experiencia operando empresas OS10 de seguridad privada en Chile. Es un producto probado en producción real.',
  },
]

const stats = [
  { value: '259', label: 'Modelos de datos Prisma' },
  { value: '801', label: 'Endpoints API' },
  { value: '6', label: 'Portales especializados' },
  { value: '18', label: 'Automatizaciones cron' },
  { value: '95%', label: 'Threshold Face ID' },
  { value: '0-100', label: 'Trust Score de rondas' },
]

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

export default function ERPSeguridadPrivadaPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* Hero */}
      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="mk-container">
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            Software especializado
          </div>
          <h1
            style={{
              fontFamily: 'var(--mk-font-h)',
              fontSize: 'clamp(2rem, 5vw, 3.4rem)',
              fontWeight: 800,
              lineHeight: 1.1,
              maxWidth: '800px',
              margin: '0 auto 24px',
            }}
          >
            ERP para empresas de seguridad privada en Chile
          </h1>
          <p
            style={{
              color: 'var(--mk-muted)',
              fontSize: 'clamp(1rem, 2vw, 1.15rem)',
              lineHeight: 1.75,
              maxWidth: '640px',
              margin: '0 auto 40px',
            }}
          >
            OPAI es el primer ERP construido exclusivamente para la industria de seguridad
            privada chilena. Gestiona guardias, rondas, marcaciones, nómina, CRM y
            finanzas con inteligencia artificial operacional real.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <Link href="/registrarse" className="mk-btn-primary">
              Comenzar gratis 30 días →
            </Link>
            <Link href="/contacto" className="mk-btn-ghost">
              Solicitar demo
            </Link>
          </div>
        </div>
      </section>

      {/* Overview */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container">
          <div className="mk-label">
            <div className="mk-pulse" />
            Por qué OPAI
          </div>
          <h2
            style={{
              fontFamily: 'var(--mk-font-h)',
              fontSize: 'clamp(1.5rem, 3.5vw, 2.4rem)',
              fontWeight: 700,
              maxWidth: '700px',
              marginBottom: '20px',
              lineHeight: 1.15,
            }}
          >
            Un ERP que entiende la seguridad privada porque nació en ella
          </h2>
          <p
            style={{
              color: 'var(--mk-muted)',
              fontSize: 'clamp(0.95rem, 1.5vw, 1.05rem)',
              lineHeight: 1.8,
              maxWidth: '680px',
              marginBottom: '16px',
            }}
          >
            OPAI nació de la experiencia real operando empresas OS10 de seguridad privada
            por más de 15 años. Cada funcionalidad fue diseñada para resolver
            problemas reales: guardias que no llegan, rondas que no se cumplen, nóminas
            que no cuadran y clientes que no reciben información a tiempo.
          </p>
          <p
            style={{
              color: 'var(--mk-muted)',
              fontSize: 'clamp(0.95rem, 1.5vw, 1.05rem)',
              lineHeight: 1.8,
              maxWidth: '680px',
            }}
          >
            Con 259 modelos de datos, 801 endpoints API y 18 automatizaciones corriendo
            24/7, OPAI no es un ERP genérico adaptado — es el sistema que toda empresa
            de seguridad privada necesita pero que no existía hasta ahora.
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container">
          <div className="mk-label">
            <div className="mk-pulse" />
            Funcionalidades principales
          </div>
          <h2
            style={{
              fontFamily: 'var(--mk-font-h)',
              fontSize: 'clamp(1.5rem, 3.5vw, 2.4rem)',
              fontWeight: 700,
              marginBottom: '48px',
              lineHeight: 1.15,
            }}
          >
            Todo lo que necesitas para operar tu empresa de seguridad
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
              gap: '20px',
            }}
          >
            {features.map((f) => (
              <div key={f.title} className="mk-card" style={{ padding: 'clamp(24px, 3vw, 32px)' }}>
                <div style={{ fontSize: '1.8rem', marginBottom: '16px' }}>{f.icon}</div>
                <h3
                  style={{
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    marginBottom: '10px',
                  }}
                >
                  {f.title}
                </h3>
                <p style={{ color: 'var(--mk-muted)', fontSize: '0.9rem', lineHeight: 1.7 }}>
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container">
          <div className="mk-label">
            <div className="mk-pulse" />
            Comparativa
          </div>
          <h2
            style={{
              fontFamily: 'var(--mk-font-h)',
              fontSize: 'clamp(1.5rem, 3.5vw, 2.4rem)',
              fontWeight: 700,
              marginBottom: '48px',
              lineHeight: 1.15,
              maxWidth: '600px',
            }}
          >
            OPAI vs. ERP genérico
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontFamily: 'var(--mk-font-b)',
                fontSize: '0.9rem',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '2px solid var(--mk-border-h)' }}>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '14px 16px',
                      fontFamily: 'var(--mk-font-h)',
                      fontWeight: 700,
                      color: 'var(--mk-text)',
                    }}
                  >
                    Funcionalidad
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '14px 16px',
                      fontFamily: 'var(--mk-font-h)',
                      fontWeight: 700,
                      color: 'var(--mk-teal)',
                    }}
                  >
                    OPAI
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '14px 16px',
                      fontFamily: 'var(--mk-font-h)',
                      fontWeight: 700,
                      color: 'var(--mk-muted)',
                    }}
                  >
                    ERP Genérico
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((c) => (
                  <tr
                    key={c.feature}
                    style={{ borderBottom: '1px solid var(--mk-border)' }}
                  >
                    <td style={{ padding: '14px 16px', color: 'var(--mk-text)' }}>
                      {c.feature}
                    </td>
                    <td
                      style={{
                        padding: '14px 16px',
                        color: 'var(--mk-teal)',
                        fontWeight: 600,
                      }}
                    >
                      {c.opai}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--mk-muted)' }}>
                      {c.generic}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container" style={{ textAlign: 'center' }}>
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            OPAI en números
          </div>
          <h2
            style={{
              fontFamily: 'var(--mk-font-h)',
              fontSize: 'clamp(1.5rem, 3.5vw, 2.4rem)',
              fontWeight: 700,
              marginBottom: '48px',
              lineHeight: 1.15,
            }}
          >
            Construido para escalar
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
              gap: '24px',
            }}
          >
            {stats.map((s) => (
              <div key={s.label} className="mk-card" style={{ padding: 'clamp(24px, 3vw, 32px)' }}>
                <div
                  style={{
                    fontFamily: 'var(--mk-font-m)',
                    fontSize: 'clamp(1.8rem, 4vw, 2.6rem)',
                    fontWeight: 800,
                    color: 'var(--mk-teal)',
                    marginBottom: '8px',
                  }}
                >
                  {s.value}
                </div>
                <div
                  style={{
                    color: 'var(--mk-muted)',
                    fontSize: '0.85rem',
                    lineHeight: 1.5,
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mk-section" style={{ borderTop: '1px solid var(--mk-border)' }}>
        <div className="mk-container">
          <div className="mk-label">
            <div className="mk-pulse" />
            Preguntas frecuentes
          </div>
          <h2
            style={{
              fontFamily: 'var(--mk-font-h)',
              fontSize: 'clamp(1.5rem, 3.5vw, 2.4rem)',
              fontWeight: 700,
              marginBottom: '48px',
              lineHeight: 1.15,
            }}
          >
            Todo sobre el ERP para seguridad privada
          </h2>
          <div style={{ maxWidth: '760px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {faqs.map((f) => (
              <div
                key={f.q}
                className="mk-card"
                style={{ padding: 'clamp(20px, 3vw, 28px)' }}
              >
                <h3
                  style={{
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: '1rem',
                    fontWeight: 700,
                    marginBottom: '10px',
                    lineHeight: 1.4,
                  }}
                >
                  {f.q}
                </h3>
                <p style={{ color: 'var(--mk-muted)', fontSize: '0.9rem', lineHeight: 1.75 }}>
                  {f.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <TrialBanner />
    </>
  )
}
