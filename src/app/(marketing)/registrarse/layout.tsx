import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Crea tu cuenta gratis — 30 días sin tarjeta | OPAI',
  description:
    'Prueba OPAI gratis por 30 días. Sin tarjeta de crédito, sin contratos, sin compromiso. Crea tu cuenta en 2 minutos y comienza a gestionar tu empresa de seguridad privada.',
  alternates: { canonical: 'https://www.opai.cl/registrarse' },
  openGraph: {
    title: 'Crea tu cuenta gratis — 30 días sin tarjeta | OPAI',
    description: '30 días gratis, acceso completo, sin tarjeta. Prueba OPAI hoy.',
    url: 'https://www.opai.cl/registrarse',
  },
}

export default function RegistrarseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
