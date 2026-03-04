import type { Metadata } from 'next';
import { DescargarPageClient } from '@/components/pwa/DescargarPageClient';

export const metadata: Metadata = {
  title: 'Descargar OPAI Guardias',
  description: 'Portal de guardias — Gard Security',
  manifest: '/manifest-guardia.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'OPAI Guardias' },
  icons: { apple: '/iconos_azul/icon-192x192.png' },
};

export default function Page() {
  return (
    <DescargarPageClient
      appName="OPAI Guardias"
      appDescription="Turnos, chat y más desde tu celular"
      iconSrc="/iconos_azul/icon-192x192.png"
      redirectTo="/portal/guardia"
    />
  );
}
