import type { Metadata } from 'next';
import { DescargarPageClient } from '@/components/pwa/DescargarPageClient';

export const metadata: Metadata = {
  title: 'Descargar OPAI Rondas',
  description: 'Portal de rondas — Gard Security',
  manifest: '/portal-rondas-manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'OPAI Rondas' },
  icons: { apple: '/iconos_azul/icon-192x192.png' },
};

export default function Page() {
  return (
    <DescargarPageClient
      appName="OPAI Rondas"
      appDescription="Rondas y marcaciones sin complicaciones"
      iconSrc="/iconos_azul/icon-192x192.png"
      redirectTo="/portal/rondas"
    />
  );
}
