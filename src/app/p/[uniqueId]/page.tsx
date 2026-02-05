/**
 * Public Presentation Page
 * 
 * Página pública para visualizar presentaciones enviadas
 * Ruta: /p/[uniqueId]
 * 
 * Features:
 * - Vista pública sin autenticación
 * - Tracking automático de vistas
 * - Analytics de usuario (IP, device, etc)
 */

import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { PresentationRenderer } from '@/components/presentation/PresentationRenderer';
import { mapZohoDataToPresentation } from '@/lib/zoho-mapper';
import { PublicPresentationTracker } from '@/components/presentation/PublicPresentationTracker';

interface PublicPresentationPageProps {
  params: Promise<{
    uniqueId: string;
  }>;
}

export default async function PublicPresentationPage({ params }: PublicPresentationPageProps) {
  const { uniqueId } = await params;

  // 1. Buscar presentación
  const presentation = await prisma.presentation.findUnique({
    where: { uniqueId },
    include: { template: true },
  });

  // 2. Validar que existe
  if (!presentation) {
    notFound();
  }

  // 3. Validar que fue enviada (no es borrador)
  if (presentation.status === 'draft') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-bold mb-4">🔒 Presentación no disponible</h1>
          <p className="text-white/70">
            Esta presentación aún no ha sido enviada.
          </p>
        </div>
      </div>
    );
  }

  // 4. Validar expiración (si aplica)
  if (presentation.expiresAt && new Date() > presentation.expiresAt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-bold mb-4">⏰ Presentación Expirada</h1>
          <p className="text-white/70 mb-6">
            Esta presentación ya no está disponible.
          </p>
          <p className="text-sm text-white/50">
            Por favor, contacta a nuestro equipo comercial para más información.
          </p>
        </div>
      </div>
    );
  }

  // 5. Extraer datos del cliente
  const clientData = presentation.clientData as any;
  const zohoData = clientData;

  // 6. Mapear datos a formato de presentación
  const presentationData = mapZohoDataToPresentation(
    zohoData,
    uniqueId,
    presentation.template.slug
  );

  // 7. Obtener info del viewer para analytics
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || '';
  const forwardedFor = headersList.get('x-forwarded-for');
  const realIp = headersList.get('x-real-ip');
  const ipAddress = forwardedFor?.split(',')[0] || realIp || 'unknown';

  // 8. Renderizar presentación
  return (
    <div className="relative">
      {/* Tracker de vistas (Client Component) */}
      <PublicPresentationTracker
        presentationId={presentation.id}
        ipAddress={ipAddress}
        userAgent={userAgent}
      />

      {/* Presentación */}
      <PresentationRenderer payload={presentationData} />

      {/* Footer con branding */}
      <footer className="bg-slate-900 text-white py-8 border-t border-white/10">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-white/60 text-sm mb-2">
            Esta presentación fue creada con
          </p>
          <p className="font-bold text-lg bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
            Gard Docs
          </p>
          <p className="text-white/40 text-xs mt-2">
            © {new Date().getFullYear()} Gard Security. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── METADATA ───────────────────────────────────────────────

export async function generateMetadata({ params }: PublicPresentationPageProps) {
  const { uniqueId } = await params;

  const presentation = await prisma.presentation.findUnique({
    where: { uniqueId },
  });

  if (!presentation) {
    return {
      title: 'Presentación no encontrada',
    };
  }

  const clientData = presentation.clientData as any;
  const companyName = clientData?.account?.Account_Name || 'Cliente';
  const subject = clientData?.quote?.Subject || 'Propuesta';

  return {
    title: `${subject} - ${companyName} | Gard Security`,
    description: `Propuesta comercial personalizada para ${companyName}`,
  };
}
