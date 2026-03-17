import type { Metadata } from 'next';
import { DescargarPageClient } from '@/components/pwa/DescargarPageClient';

export const metadata: Metadata = {
  title: 'Descargar OPAI Supervisor',
  description: 'Portal de supervisores — Gard Security',
  manifest: '/manifest-supervisor.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'OPAI Supervisor' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export default function Page() {
  return (
    <DescargarPageClient
      appName="OPAI Supervisor"
      appDescription="Hub operacional para supervisores de seguridad"
      iconSrc="/icons/apple-touch-icon.png"
      redirectTo="/portal/supervisor"
    />
  );
}
