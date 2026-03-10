import type { Metadata } from 'next';
import { DescargarPageClient } from '@/components/pwa/DescargarPageClient';

export const metadata: Metadata = {
  title: 'Descargar OPAI',
  description: 'Descarga la app de OPAI — Gard Security',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'OPAI' },
  icons: { apple: '/icons/apple-touch-icon.png' },
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
