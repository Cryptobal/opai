import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'Gestión de Guardias y Operaciones',
  description:
    'Administra guardias, turnos, asignaciones y check-ins con GPS, QR, PIN y Face ID. Onboarding digital, inventario de equipamiento y cumplimiento OS10 integrado.',
  alternates: {
    canonical: 'https://www.opai.cl/funcionalidades/operaciones',
  },
}

const features = [
  {
    title: 'Fichas de guardias con OS10',
    description:
      'Perfiles completos con documentación, certificaciones, capacitaciones y todo lo que exige la normativa OS10. Digitaliza el legajo completo del guardia.',
  },
  {
    title: 'Programación mensual drag & drop',
    description:
      'Crea y ajusta turnos mensuales arrastrando bloques. Visualiza cobertura en tiempo real, detecta conflictos automáticamente y publica con un clic.',
  },
  {
    title: 'Series de asignación',
    description:
      'Define patrones recurrentes de turnos (4x4, 7x7, etc.) y genera asignaciones masivas en segundos. El sistema respeta descansos legales y disponibilidad.',
  },
  {
    title: 'Check-in multi-método',
    description:
      'GPS, QR, PIN y Face ID — cuatro formas de registrar asistencia. El guardia usa la que tenga disponible; el sistema valida ubicación y hora automáticamente.',
  },
  {
    title: 'Alertas de cobertura en tiempo real',
    description:
      'Si un guardia no se presenta, OPAI dispara alertas WhatsApp por oleadas al pool de reemplazantes disponibles hasta cubrir el puesto.',
  },
  {
    title: 'Onboarding digital',
    description:
      'Flujo guiado para nuevos guardias: carga de documentos, foto biométrica, firma digital de contrato y asignación a su primer turno — todo desde el celular.',
  },
  {
    title: 'Inventario de equipamiento',
    description:
      'Controla radios, chalecos, linternas y todo el equipamiento asignado a cada guardia. Historial de entregas, devoluciones y estado de cada artículo.',
  },
]

export default function OperacionesPage() {
  return (
    <>
      {/* Hero */}
      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="mk-container">
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            Operaciones
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
            Operaciones de seguridad privada al siguiente nivel
          </h1>
          <p style={{
            color: 'var(--mk-muted)',
            fontSize: 'clamp(1rem, 2vw, 1.15rem)',
            lineHeight: 1.75,
            maxWidth: '600px',
            margin: '0 auto 40px',
          }}>
            Desde la ficha del guardia hasta el check-in en terreno — un flujo continuo que
            elimina planillas Excel, llamadas manuales y errores de cobertura.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <Link href="/registrarse" className="mk-btn-primary">
              Probar gratis 30 días →
            </Link>
            <Link href="/funcionalidades" className="mk-btn-ghost">
              ← Todas las funcionalidades
            </Link>
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
