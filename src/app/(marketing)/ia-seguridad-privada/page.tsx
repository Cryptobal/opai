import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'Inteligencia Artificial para Seguridad Privada | OPAI',
  description:
    'IA operacional real para empresas de seguridad privada. RAG help chat, OCR de documentos, control nocturno, detección de frustración y enriquecimiento CRM con OpenAI gpt-4o y Claude.',
  alternates: { canonical: 'https://www.opai.cl/ia-seguridad-privada' },
  openGraph: {
    title: 'Inteligencia Artificial para Seguridad Privada | OPAI',
    description:
      'IA que trabaja 24/7: help chat con RAG, OCR, detección de anomalías y enriquecimiento automático de CRM.',
    url: 'https://www.opai.cl/ia-seguridad-privada',
    type: 'website',
    images: [{ url: '/icons/og-image.png', width: 1200, height: 630, alt: 'OPAI — ERP con IA para Seguridad Privada' }],
  },
}

const sections = [
  {
    id: 'rag',
    label: 'Help Chat RAG',
    icon: '💬',
    title: 'Asistente inteligente con RAG',
    subtitle: 'Respuestas precisas basadas en tus datos operacionales',
    description:
      'El help chat de OPAI utiliza Retrieval-Augmented Generation con pgvector para buscar en toda la base de conocimientos de tu empresa: manuales, procedimientos, contratos, normativas y datos históricos. Las respuestas no son genéricas — son específicas a tu operación.',
    details: [
      'Motor: OpenAI gpt-4o con fallback automático a Claude (Anthropic)',
      'Embeddings almacenados en pgvector para búsqueda semántica',
      'Contexto: manuales, procedimientos, contratos, normativas',
      'Cada respuesta incluye la fuente de información',
      'Disponible en todos los portales: admin, operaciones, guardia',
    ],
  },
  {
    id: 'ocr',
    label: 'OCR Documentos',
    icon: '📄',
    title: 'OCR inteligente de documentos',
    subtitle: 'Digitaliza y extrae datos automáticamente',
    description:
      'Sube certificados OS10, cédulas de identidad, licencias de conducir, contratos o cualquier documento. La IA extrae los datos relevantes, los valida y los ingresa al sistema automáticamente. Sin digitación manual, sin errores.',
    details: [
      'Extracción automática de datos de certificados OS10',
      'Lectura de cédulas de identidad y licencias',
      'Validación de fechas de vencimiento',
      'Clasificación automática del tipo de documento',
      'Almacenamiento seguro en Cloudflare R2',
    ],
  },
  {
    id: 'nocturno',
    label: 'Control Nocturno',
    icon: '🌙',
    title: 'Control nocturno con IA',
    subtitle: 'Vigilancia inteligente del turno más crítico',
    description:
      'El turno nocturno es donde más incidentes ocurren y donde menos supervisión hay. La IA de OPAI monitorea patrones de rondas nocturnas, detecta inactividad prolongada, valida que los checkpoints se cumplan a tiempo y genera alertas proactivas si algo se sale de lo normal.',
    details: [
      'Detección de inactividad prolongada en turno nocturno',
      'Validación de checkpoints con tolerancia horaria ajustable',
      'Alertas proactivas por WhatsApp al supervisor de turno',
      'Análisis de patrones nocturnos vs. diurnos',
      'Trust Score ajustado por horario y condiciones',
    ],
  },
  {
    id: 'frustracion',
    label: 'Detección de Frustración',
    icon: '😤',
    title: 'Detección de frustración en conversaciones',
    subtitle: 'Anticipa problemas antes de que escalen',
    description:
      'La IA analiza las conversaciones del sistema (mensajes internos, chat de soporte, notas de incidentes) y detecta señales de frustración en guardias, supervisores o clientes. Esto permite intervenir proactivamente antes de que un problema menor se convierta en una baja o un cliente perdido.',
    details: [
      'Análisis de sentimiento en tiempo real',
      'Detección de patrones de frustración recurrente',
      'Alertas al supervisor cuando un guardia muestra señales de riesgo',
      'Alertas al ejecutivo cuando un cliente muestra insatisfacción',
      'Histórico de sentimiento por persona para tendencias',
    ],
  },
  {
    id: 'crm',
    label: 'Enriquecimiento CRM',
    icon: '🏢',
    title: 'Enriquecimiento automático de CRM',
    subtitle: 'Datos completos sin trabajo manual',
    description:
      'Cuando ingresas un nuevo prospecto o cliente al CRM, la IA busca información pública disponible: razón social, giro, dirección, cantidad de sucursales, industria y más. El perfil se completa automáticamente, ahorrando tiempo al equipo comercial y mejorando la calidad de los datos.',
    details: [
      'Búsqueda automática de datos públicos de empresas',
      'Completación de perfil: razón social, RUT, giro, dirección',
      'Clasificación por industria y tamaño',
      'Sugerencia de servicios según perfil del cliente',
      'Integración nativa con el módulo CRM de OPAI',
    ],
  },
]

export default function IAPageSeguridadPrivada() {
  return (
    <>
      {/* Hero */}
      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="mk-container">
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            IA Operacional
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
            Inteligencia Artificial para Empresas de Seguridad Privada
          </h1>
          <p
            style={{
              color: 'var(--mk-muted)',
              fontSize: 'clamp(1rem, 2vw, 1.15rem)',
              lineHeight: 1.75,
              maxWidth: '660px',
              margin: '0 auto 24px',
            }}
          >
            No es IA decorativa. OPAI integra OpenAI gpt-4o con Claude como fallback
            para automatizar tareas reales: help chat con RAG, OCR de documentos,
            control nocturno inteligente, detección de frustración y enriquecimiento
            automático de CRM.
          </p>
          <p
            style={{
              fontFamily: 'var(--mk-font-m)',
              fontSize: '0.8rem',
              color: 'var(--mk-teal)',
              margin: '0 auto 40px',
              letterSpacing: '0.04em',
            }}
          >
            OpenAI gpt-4o &nbsp;·&nbsp; Anthropic Claude (fallback) &nbsp;·&nbsp; pgvector RAG &nbsp;·&nbsp; AWS Rekognition
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <Link href="/registrarse" className="mk-btn-primary">
              Probar IA gratis →
            </Link>
            <Link href="/contacto" className="mk-btn-ghost">
              Solicitar demo
            </Link>
          </div>
        </div>
      </section>

      {/* Sections */}
      {sections.map((s, i) => (
        <section
          key={s.id}
          className="mk-section"
          style={{ borderTop: '1px solid var(--mk-border)' }}
        >
          <div className="mk-container">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
                gap: 'clamp(32px, 5vw, 64px)',
                alignItems: 'start',
              }}
            >
              <div style={{ order: i % 2 === 0 ? 0 : 1 }}>
                <div className="mk-label">
                  <div className="mk-pulse" />
                  {s.label}
                </div>
                <div style={{ fontSize: '2.4rem', marginBottom: '16px' }}>{s.icon}</div>
                <h2
                  style={{
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: 'clamp(1.4rem, 3vw, 2rem)',
                    fontWeight: 700,
                    marginBottom: '8px',
                    lineHeight: 1.2,
                  }}
                >
                  {s.title}
                </h2>
                <p
                  style={{
                    color: 'var(--mk-teal)',
                    fontSize: '0.95rem',
                    marginBottom: '16px',
                    fontWeight: 500,
                  }}
                >
                  {s.subtitle}
                </p>
                <p
                  style={{
                    color: 'var(--mk-muted)',
                    fontSize: '0.92rem',
                    lineHeight: 1.8,
                  }}
                >
                  {s.description}
                </p>
              </div>
              <div className="mk-card" style={{ padding: 'clamp(24px, 3vw, 32px)' }}>
                <h3
                  style={{
                    fontFamily: 'var(--mk-font-h)',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    color: 'var(--mk-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    marginBottom: '20px',
                  }}
                >
                  Capacidades
                </h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {s.details.map((d) => (
                    <li
                      key={d}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        marginBottom: '14px',
                        fontSize: '0.88rem',
                        color: 'var(--mk-muted)',
                        lineHeight: 1.6,
                      }}
                    >
                      <span
                        style={{
                          color: 'var(--mk-teal)',
                          fontWeight: 700,
                          flexShrink: 0,
                          marginTop: '2px',
                        }}
                      >
                        +
                      </span>
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      ))}

      <TrialBanner />
    </>
  )
}
