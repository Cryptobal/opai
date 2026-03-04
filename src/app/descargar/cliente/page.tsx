import type { Metadata } from 'next';
import { DescargarPageClient } from '@/components/pwa/DescargarPageClient';

export const metadata: Metadata = {
  title: 'Descargar OPAI Clientes',
  description: 'Portal de clientes — Gard Security',
  manifest: '/manifest-cliente.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'OPAI Clientes' },
  icons: { apple: '/iconos_azul/icon-192x192.png' },
};

export default function Page() {
  return (
    <DescargarPageClient
      appName="OPAI Clientes"
      appDescription="Tu portal de seguridad siempre disponible"
      iconSrc="/iconos_azul/icon-192x192.png"
      redirectTo="/portal/cliente"
    />
  );
}
