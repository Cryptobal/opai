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
import { DownloadPresentationSection } from '@/components/presentation/DownloadPresentationSection';

interface PublicPresentationPageProps {
  params: Promise<{
    uniqueId: string;
  }>;
  searchParams: Promise<{
    preview?: string;
    mode?: string;
  }>;
}

export default async function PublicPresentationPage({ params, searchParams }: PublicPresentationPageProps) {
  const { uniqueId } = await params;
  const { preview, mode } = await searchParams;
  
  // Detectar si es vista de admin/preview (no trackear)
  const isAdminPreview = preview === 'true';
  // Detectar modo PDF (usado por Playwright para generar PDF)
  const isPdfMode = mode === 'pdf';

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
  const isCpqData = !!clientData._cpqQuoteId;

  // 6. Mapear datos a formato de presentación
  // Para datos CPQ, ya vienen en formato PresentationPayload
  const presentationData = isCpqData
    ? { ...clientData, id: uniqueId, template_id: presentation.template.slug }
    : mapZohoDataToPresentation(clientData, uniqueId, presentation.template.slug);

  // 6.1 Para datos CPQ: cargar negocio e instalación desde BD si no están en los datos almacenados
  if (isCpqData && (!presentationData._dealName || !presentationData._installationName)) {
    const cpqQuoteId = clientData._cpqQuoteId;
    if (cpqQuoteId) {
      const cpqQuote = await prisma.cpqQuote.findUnique({
        where: { id: cpqQuoteId },
        select: {
          dealId: true,
          installation: { select: { name: true } },
        },
      });
      if (cpqQuote) {
        if (!presentationData._installationName && cpqQuote.installation?.name) {
          presentationData._installationName = cpqQuote.installation.name;
        }
        if (!presentationData._dealName && cpqQuote.dealId) {
          const deal = await prisma.crmDeal.findUnique({
            where: { id: cpqQuote.dealId },
            select: { title: true },
          });
          if (deal) {
            presentationData._dealName = deal.title;
          }
        }
      }
    }
  }

  // 7. Obtener info del viewer para analytics
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || '';
  const forwardedFor = headersList.get('x-forwarded-for');
  const realIp = headersList.get('x-real-ip');
  const ipAddress = forwardedFor?.split(',')[0] || realIp || 'unknown';

  // 8. Renderizar presentación
  
  // Modo PDF: renderizar versión optimizada para Playwright (sin chrome, sin tracking)
  if (isPdfMode) {
    return (
      <PresentationRenderer payload={presentationData} pdfMode={true} />
    );
  }
  
  return (
    <div className="relative">
      {/* Banner de Admin Preview */}
      {isAdminPreview && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-black py-2 px-4 text-center font-semibold text-sm shadow-lg">
          <div className="max-w-6xl mx-auto flex items-center justify-center gap-2">
            <span>👁️ VISTA PREVIA DE ADMINISTRADOR</span>
            <span className="text-xs opacity-75">• Esta vista no se contabiliza</span>
          </div>
        </div>
      )}

      {/* Tracker de vistas (Client Component) - SOLO si NO es admin preview */}
      {!isAdminPreview && (
        <PublicPresentationTracker
          presentationId={presentation.id}
          ipAddress={ipAddress}
          userAgent={userAgent}
        />
      )}

      {/* Presentación */}
      <div className={isAdminPreview ? 'pt-10' : ''}>
        <PresentationRenderer payload={presentationData} />
      </div>

      {/* Sección de descarga PDF */}
      <DownloadPresentationSection uniqueId={uniqueId} />

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
  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'opai.gard.cl';
  const protocol = headersList.get('x-forwarded-proto') ?? 'https';
  const baseUrl = `${protocol}://${host}`;
  const publicUrl = `${baseUrl}/p/${uniqueId}`;
  const ogImageUrl = `${publicUrl}/opengraph-image`;

  const presentation = await prisma.presentation.findUnique({
    where: { uniqueId },
  });

  if (!presentation) {
    return {
      title: 'Presentación no encontrada',
    };
  }

  const clientData = presentation.clientData as any;
  const isCpq = !!clientData?._cpqQuoteId;
  const companyName = isCpq
    ? (clientData?.client?.company_name || 'Cliente')
    : (clientData?.account?.Account_Name || 'Cliente');
  const subject = isCpq
    ? (clientData?.quote?.subject || 'Propuesta')
    : (clientData?.quote?.Subject || 'Propuesta');
  const title = `${subject} - ${companyName} | Gard Security`;
  const description = `Propuesta comercial personalizada para ${companyName}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: publicUrl,
      siteName: 'Gard Security',
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `Propuesta de Gard Security para ${companyName}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}
