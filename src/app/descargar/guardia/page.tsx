import type { Metadata } from 'next';
import { DescargarPageClient } from '@/components/pwa/DescargarPageClient';

export const metadata: Metadata = {
  title: 'Descargar OPAI Guardias',
  description: 'Portal de guardias — Gard Security',
  manifest: '/manifest-guardia.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'OPAI Guardias' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export default function Page() {
  return (
    <DescargarPageClient
      appName="OPAI Guardias"
      appDescription="Turnos, chat y más desde tu celular"
      iconSrc="/icons/apple-touch-icon.png"
      redirectTo="/portal/guardia"
    />
  );
}
