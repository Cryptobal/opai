import type { Metadata } from 'next';
import { DescargarPageClient } from '@/components/pwa/DescargarPageClient';

export const metadata: Metadata = {
  title: 'Descargar OPAI',
  description: 'Descarga la app de OPAI',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'OPAI' },
  icons: { apple: '/icons/apple-touch-icon.png' },
  openGraph: {
    title: 'Descargar OPAI',
    description: 'Descarga la app de OPAI para gestionar tu empresa de seguridad privada.',
    type: 'website',
    images: [{ url: '/icons/og-image.png', width: 1200, height: 630, alt: 'OPAI' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Descargar OPAI',
    description: 'Descarga la app de OPAI para gestionar tu empresa de seguridad privada.',
    images: ['/icons/og-image.png'],
  },
};

export default function Page() {
  return (
    <DescargarPageClient
      appName="OPAI"
      appDescription="Gestiona tu operación de seguridad desde cualquier lugar"
      iconSrc="/icons/apple-touch-icon.png"
      redirectTo="/opai/login"
    />
  );
}
