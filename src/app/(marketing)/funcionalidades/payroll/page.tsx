import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'Payroll y Nómina para Guardias de Seguridad — Chile',
  description:
    'Liquidaciones de sueldo para guardias de seguridad en Chile. Cálculo de turnos rotativos, horas extra automáticas, Libro de Remuneraciones Electrónico (LRE), Previred, AFC y simulador de liquidación.',
  alternates: {
    canonical: 'https://www.opai.cl/funcionalidades/payroll',
  },
}

const features = [
  {
    title: 'Liquidaciones de sueldo especializadas',
    description:
      'Liquidaciones diseñadas para guardias de seguridad con turnos rotativos, nocturnos y festivos. Cálculo automático de haberes, descuentos legales, AFC, salud e impuestos según la normativa chilena vigente.',
  },
  {
    title: 'Cálculo de turnos rotativos',
    description:
      'Importa directamente las horas trabajadas desde la pauta de turnos de OPAI. Los turnos 4×4, 7×7 y esquemas personalizados se calculan sin intervención manual.',
  },
  {
    title: 'Horas extra automáticas',
    description:
      'Detección automática de sobretiempo a partir de las marcaciones reales. Horas extra al 50%, recargos nocturnos, festivos y dominicales calculados según el Código del Trabajo.',
  },
  {
    title: 'Libro de Remuneraciones Electrónico (LRE)',
    description:
      'Generación del LRE en formato exigido por la Dirección del Trabajo. Exportación directa para carga en el portal mi.dt.gob.cl sin reprocesos ni planillas intermedias.',
  },
  {
    title: 'Previred y AFC',
    description:
      'Generación automática del archivo Previred para el pago de cotizaciones previsionales. Cálculo de AFP, Fonasa/Isapre, Seguro de Cesantía (AFC), mutual y otros descuentos legales.',
  },
  {
    title: 'Anticipos y bonos',
    description:
      'Gestión de anticipos de sueldo con descuento automático en la liquidación. Bonos por asistencia perfecta, bonos de turno nocturno, aguinaldos y asignaciones especiales configurables.',
  },
  {
    title: 'Simulador de liquidación',
    description:
      'Permite al guardia y al administrador simular una liquidación antes del cierre. Proyecta el líquido a pagar considerando turnos programados, anticipos pendientes y descuentos.',
  },
  {
    title: 'Finiquitos y vacaciones',
    description:
      'Cálculo de finiquitos con indemnizaciones, feriado proporcional y pendientes. Control de vacaciones legales y progresivas con alerta de vencimiento.',
  },
]

export default function PayrollPage() {
  return (
    <>
      {/* Hero */}
      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="mk-container">
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            Payroll
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
            Nómina diseñada para guardias de seguridad
          </h1>
          <p style={{
            color: 'var(--mk-muted)',
            fontSize: 'clamp(1rem, 2vw, 1.15rem)',
            lineHeight: 1.75,
            maxWidth: '600px',
            margin: '0 auto 40px',
          }}>
            No es un sistema de RRHH genérico. El payroll de OPAI calcula directamente desde
            los turnos reales, las marcaciones GPS y los esquemas rotativos de seguridad privada en Chile.
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
