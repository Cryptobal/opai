import type { Metadata } from 'next'
import Link from 'next/link'
import { TrialBanner } from '@/components/marketing/TrialBanner'

export const metadata: Metadata = {
  title: 'Finanzas y Facturación DTE para Seguridad Privada',
  description:
    'Finanzas integradas al negocio de seguridad privada: contabilidad partida doble, facturación electrónica DTE, conciliación bancaria, factoring y reportes de gastos multinivel.',
  alternates: {
    canonical: 'https://www.opai.cl/funcionalidades/finanzas',
  },
  openGraph: {
    title: 'Finanzas y Facturación DTE para Seguridad Privada | OPAI',
    description:
      'Finanzas integradas al negocio de seguridad privada: contabilidad partida doble, facturación electrónica DTE, conciliación bancaria, factoring y reportes de gastos multinivel.',
    url: 'https://www.opai.cl/funcionalidades/finanzas',
    type: 'website',
    images: [{ url: '/icons/og-image.png', width: 1200, height: 630, alt: 'OPAI — ERP con IA para Seguridad Privada' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Finanzas y Facturación DTE | OPAI',
    description: 'Contabilidad partida doble, DTE, conciliación bancaria y factoring.',
    images: ['/icons/og-image.png'],
  },
}

const features = [
  {
    title: 'Contabilidad partida doble',
    description:
      'Plan de cuentas adaptado al giro de seguridad privada. Asientos automáticos por facturación, nómina y gastos. Balances y estados de resultado en tiempo real.',
  },
  {
    title: 'Facturación electrónica DTE',
    description:
      'Emisión de facturas, boletas, notas de crédito y débito integrada con el SII. Folios, CAF, timbraje y envío al correo del cliente — todo automático.',
  },
  {
    title: 'Conciliación bancaria',
    description:
      'Importa cartolas bancarias y el sistema concilia automáticamente con los movimientos registrados. Identifica diferencias y sugiere matches inteligentes.',
  },
  {
    title: 'Factoring integrado',
    description:
      'Gestiona la cesión de facturas a empresas de factoring directamente desde OPAI. Control de facturas cedidas, montos anticipados y comisiones.',
  },
  {
    title: 'Reportes de gastos multinivel',
    description:
      'Gastos por sucursal, por contrato, por cliente o por centro de costo. Aprobaciones jerárquicas, comprobantes digitalizados y control presupuestario.',
  },
  {
    title: 'Dashboard financiero',
    description:
      'Visión consolidada de ingresos, egresos, cuentas por cobrar, cuentas por pagar y flujo de caja proyectado. Los números del negocio en una sola pantalla.',
  },
]

export default function FinanzasPage() {
  return (
    <>
      {/* Hero */}
      <section className="mk-section" style={{ textAlign: 'center' }}>
        <div className="mk-container">
          <div className="mk-label" style={{ margin: '0 auto 24px' }}>
            <div className="mk-pulse" />
            Finanzas
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
            Finanzas integradas al negocio de seguridad
          </h1>
          <p style={{
            color: 'var(--mk-muted)',
            fontSize: 'clamp(1rem, 2vw, 1.15rem)',
            lineHeight: 1.75,
            maxWidth: '600px',
            margin: '0 auto 40px',
          }}>
            No es un sistema contable genérico. Las finanzas de OPAI nacen de la operación:
            cada turno facturado, cada gasto por contrato, cada liquidación de sueldo ya está conectada.
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
