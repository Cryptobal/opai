import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Crea tu cuenta gratis — Sin tarjeta | OPAI',
  description:
    'Prueba OPAI gratis. Sin tarjeta de crédito, sin contratos, sin compromiso. Crea tu cuenta en 2 minutos y comienza a gestionar tu empresa de seguridad privada.',
  alternates: { canonical: 'https://www.opai.cl/registrarse' },
  openGraph: {
    title: 'Crea tu cuenta gratis — Sin tarjeta | OPAI',
    description: 'Gratis para siempre, acceso completo, sin tarjeta. Prueba OPAI hoy.',
    url: 'https://www.opai.cl/registrarse',
    type: 'website',
    images: [{ url: '/icons/og-image.png', width: 1200, height: 630, alt: 'OPAI — ERP con IA para Seguridad Privada' }],
  },
}

export default function RegistrarseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
