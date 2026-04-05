import type { Metadata } from 'next';
import { DescargarPageClient } from '@/components/pwa/DescargarPageClient';

export const metadata: Metadata = {
  title: 'Descargar OPAI Control de Acceso',
  description: 'Control de acceso e ingreso — OPAI',
  manifest: '/manifest-acceso.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Control Acceso' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export default function Page() {
  return (
    <DescargarPageClient
      appName="Control de Acceso"
      appDescription="Registro de ingresos y salidas en tiempo real"
      iconSrc="/icons/apple-touch-icon.png"
      redirectTo="/portal/acceso"
    />
  );
}
