import type { Metadata } from 'next';
import { DescargarPageClient } from '@/components/pwa/DescargarPageClient';

export const metadata: Metadata = {
  title: 'Descargar OPAI Marcación',
  description: 'Marcación de asistencia con Face ID — OPAI',
  manifest: '/manifest-marcacion.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Marcación' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export default function Page() {
  return (
    <DescargarPageClient
      appName="Marcación"
      appDescription="Entrada y salida con Face ID o PIN"
      iconSrc="/icons/apple-touch-icon.png"
      redirectTo="/portal/marcacion"
    />
  );
}
