import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'IA Operacional para Seguridad Privada',
  description:
    'Inteligencia artificial integrada en operaciones reales: RAG con pgvector, OCR con OpenAI y Claude, análisis nocturno, detección de frustración y enriquecimiento CRM.',
  alternates: {
    canonical: 'https://www.opai.cl/funcionalidades/ia-operacional',
  },
}

const features = [
  {
    title: 'RAG con pgvector',
    description:
      'Base de conocimiento vectorial que permite consultas en lenguaje natural sobre procedimientos, contratos, normativas y datos operacionales. La IA responde con contexto real de tu empresa.',
  },
  {
    title: 'OCR inteligente (OpenAI + Claude)',
    description:
      'Extracción de texto de documentos, credenciales y certificados con doble motor: OpenAI como primario y Claude como fallback. Precisión superior al 98% en documentos chilenos.',
  },
  {
    title: 'Análisis de control nocturno',
    description:
      'La IA revisa automáticamente las novedades del turno nocturno, detecta patrones inusuales, correlaciona eventos y genera un informe ejecutivo listo para el cliente.',
  },
  {
    title: 'Detección de frustración',
    description:
      'Más de 35 patrones lingüísticos analizados en tiempo real en las comunicaciones internas. Detecta insatisfacción temprana para prevenir rotación y conflictos laborales.',
  },
  {
    title: 'Enriquecimiento CRM con IA',
    description:
      'Búsqueda automática de información pública de leads: razón social, actividad económica, tamaño estimado de operación. El vendedor llega a la reunión ya preparado.',
  },
  {
    title: '18 cron jobs automatizados',
    description:
      'Procesos nocturnos y periódicos que analizan rondas, generan reportes, reconcilian datos, envían alertas y mantienen el sistema optimizado — sin intervención manual.',
  },
]

export default function IaOperacionalPage() {
  return (
    <>
      {/* Hero */}
      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="mk-container">
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            IA operacional
          </div>
          <h1 style={{
            fontFamily: 'var(--mk-font-h)',
            fontSize: 'clamp(2rem, 5vw, 3.2rem)',
            fontWeight: 800,
            lineHeight: 1.1,
            color: 'var(--mk-text)',
            maxWidth: '720px',
            margin: '0 auto 24px',
          }}>
            Inteligencia artificial integrada en operaciones reales
          </h1>
          <p style={{
            color: 'var(--mk-muted)',
            fontSize: 'clamp(1rem, 2vw, 1.15rem)',
            lineHeight: 1.75,
            maxWidth: '600px',
            margin: '0 auto 40px',
          }}>
            No es un chatbot genérico. Es IA que entiende tu operación de seguridad, analiza
            rondas, detecta anomalías, lee documentos y previene rotación — OpenAI + Claude
            trabajando en producción real.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <a href="https://opai.gard.cl/registro" target="_blank" rel="noopener noreferrer" className="mk-btn-primary">
              Probar gratis 30 días →
            </a>
            <Link href="/funcionalidades" className="mk-btn-ghost">
              ← Todas las funcionalidades
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section style={{ paddingBottom: 'clamp(40px, 6vw, 80px)' }}>
        <div className="mk-container">
          <div className="mk-card" style={{
            padding: 'clamp(32px, 4vw, 56px)',
            borderColor: 'var(--mk-teal-mid)',
            background: 'linear-gradient(180deg, var(--mk-teal-dim) 0%, var(--mk-bg-card) 100%)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
            gap: '32px',
            textAlign: 'center',
          }}>
            {[
              { value: '35+', label: 'Patrones de frustración' },
              { value: '2', label: 'Motores IA (OpenAI + Claude)' },
              { value: '18', label: 'Cron jobs automatizados' },
              { value: 'pgvector', label: 'Base vectorial RAG' },
            ].map((s) => (
              <div key={s.label}>
                <span style={{
                  fontFamily: 'var(--mk-font-m)',
                  fontSize: 'clamp(1.4rem, 4vw, 2.2rem)',
                  fontWeight: 800,
                  color: 'var(--mk-teal)',
                  display: 'block',
                  marginBottom: '8px',
                }}>
                  {s.value}
                </span>
                <span style={{
                  color: 'var(--mk-muted)',
                  fontSize: '0.85rem',
                }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ paddingBottom: 'var(--mk-section)' }}>
        <div className="mk-container">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
            gap: 'clamp(16px, 2vw, 24px)',
          }}>
            {features.map((f) => (
              <div
                key={f.title}
                className="mk-card"
                style={{ padding: 'clamp(24px, 3vw, 36px)' }}
              >
                <h3 style={{
                  fontFamily: 'var(--mk-font-h)',
                  fontSize: 'clamp(1.05rem, 2vw, 1.2rem)',
                  fontWeight: 700,
                  color: 'var(--mk-text)',
                  marginBottom: '12px',
                }}>
                  {f.title}
                </h3>
                <p style={{
                  color: 'var(--mk-muted)',
                  fontSize: '0.9rem',
                  lineHeight: 1.75,
                  margin: 0,
                }}>
                  {f.description}
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
