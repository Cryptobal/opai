import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contacto | OPAI',
  description:
    'Contacta al equipo de OPAI. WhatsApp +56 9 8230 7771, email carlos.irigoyen@lx3.ai. Te respondemos en menos de 24 horas.',
  alternates: { canonical: 'https://www.opai.cl/contacto' },
  openGraph: {
    title: 'Contacto | OPAI',
    description: 'Escríbenos por WhatsApp o email. Te respondemos en menos de 24 horas.',
    url: 'https://www.opai.cl/contacto',
    type: 'website',
    images: [{ url: '/icons/og-image.png', width: 1200, height: 630, alt: 'OPAI — ERP con IA para Seguridad Privada' }],
  },
}

export default function ContactoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
