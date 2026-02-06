/**
 * Preview Draft Page
 * 
 * Muestra vista previa del borrador de presentación
 * con datos reales de Zoho CRM
 * 
 * Ruta: /preview/[sessionId]
 */

import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PresentationRenderer } from '@/components/presentation/PresentationRenderer';
import { mapZohoDataToPresentation } from '@/lib/zoho-mapper';
import { PreviewActions } from '@/components/preview/PreviewActions';
import { PreviewSidebar } from '@/components/preview/PreviewSidebar';

interface PreviewPageProps {
  params: Promise<{
    sessionId: string;
  }>;
  searchParams: Promise<{
    template?: string;
  }>;
}

export default async function PreviewPage({ params, searchParams }: PreviewPageProps) {
  const { sessionId } = await params;
  const { template: templateSlug } = await searchParams;

  // 1. Buscar sesión de webhook
  const webhookSession = await prisma.webhookSession.findUnique({
    where: { sessionId },
  });

  // 2. Validar que existe y no expiró
  if (!webhookSession) {
    notFound();
  }

  if (webhookSession.status === 'expired' || new Date() > webhookSession.expiresAt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-bold mb-4">⏰ Sesión Expirada</h1>
          <p className="text-white/70 mb-6">
            Esta sesión de preview ha expirado. Por favor, genera una nueva desde Zoho CRM.
          </p>
          <p className="text-sm text-white/50">
            Sesión ID: {sessionId}
          </p>
        </div>
      </div>
    );
  }

  // 3. Obtener datos de Zoho
  const zohoData = webhookSession.zohoData as any;

  // 4. Obtener template (usa el especificado o el default)
  const template = await prisma.template.findFirst({
    where: templateSlug 
      ? { slug: templateSlug, active: true }
      : { isDefault: true, active: true },
  });

  if (!template) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-bold mb-4">❌ Template no encontrado</h1>
          <p className="text-white/70">
            No hay templates disponibles actualmente.
          </p>
        </div>
      </div>
    );
  }

  // 5. Mapear datos de Zoho a PresentationPayload
  const presentationData = mapZohoDataToPresentation(zohoData, sessionId, template.slug);

  // 6. Extraer datos del contacto
  const contactName = `${zohoData.contact?.First_Name || ''} ${zohoData.contact?.Last_Name || ''}`.trim();
  const contactEmail = zohoData.contact?.Email || '';

  // 7. Renderizar presentación
  return (
    <div className="relative">
      {/* Banner de preview */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-black py-3 px-4 text-center font-semibold text-sm shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="/opai/inicio"
              className="px-3 py-1.5 rounded-lg bg-black/10 hover:bg-black/20 transition-colors text-xs font-bold"
            >
              ← Dashboard
            </a>
            <div>
              📋 PREVIEW DE BORRADOR - Cliente: {presentationData.client.company_name}
            </div>
          </div>
          <div className="text-xs">
            Expira: {webhookSession.expiresAt.toLocaleString('es-CL')}
          </div>
        </div>
      </div>

      {/* Sidebar flotante */}
      <PreviewSidebar sessionId={sessionId} zohoData={zohoData} />

      {/* Presentación */}
      <div className="pt-14">
        <PresentationRenderer payload={presentationData} />
      </div>

      {/* Botones de acción */}
      <PreviewActions 
        sessionId={sessionId} 
        companyName={presentationData.client.company_name}
        contactName={contactName}
        contactEmail={contactEmail}
      />
      
      {/* Espaciador para los botones */}
      <div className="h-24" />
    </div>
  );
}
