import type { Metadata } from 'next';
import { DescargarPageClient } from '@/components/pwa/DescargarPageClient';

export const metadata: Metadata = {
  title: 'Descargar OPAI Rondas',
  description: 'Portal de rondas — OPAI',
  manifest: '/portal-rondas-manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'OPAI Rondas' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export default function Page() {
  return (
    <DescargarPageClient
      appName="OPAI Rondas"
      appDescription="Rondas y marcaciones sin complicaciones"
      iconSrc="/icons/apple-touch-icon.png"
      redirectTo="/portal/rondas"
    />
  );
}
