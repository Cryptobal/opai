/**
 * Email Preview Page
 * 
 * Muestra preview del email que se enviará
 * con datos reales de la sesión
 */

import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';

interface EmailPreviewPageProps {
  params: Promise<{
    sessionId: string;
  }>;
}

export default async function EmailPreviewPage({ params }: EmailPreviewPageProps) {
  const { sessionId } = await params;

  // 1. Buscar sesión de webhook
  const webhookSession = await prisma.webhookSession.findUnique({
    where: { sessionId },
  });

  if (!webhookSession) {
    notFound();
  }

  // 2. Extraer datos de Zoho
  const zohoData = webhookSession.zohoData as any;
  
  const contactName = `${zohoData.contact?.First_Name || ''} ${zohoData.contact?.Last_Name || ''}`.trim();
  const contactEmail = zohoData.contact?.Email || '';
  const quoteSubject = zohoData.quote?.Subject || 'Propuesta de Servicios';

  // 4. Renderizar email como HTML
  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-slate-900 text-white py-4 px-6 border-b border-white/10">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-bold">📧 Preview de Email</h1>
          <p className="text-white/60 text-sm mt-1">
            Así se verá el email que recibirá el cliente
          </p>
        </div>
      </div>

      {/* Tabs de dispositivo */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-3 flex gap-2">
          <button className="px-4 py-2 bg-teal-500 text-white rounded-lg text-sm font-semibold">
            💻 Desktop
          </button>
          <button className="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-300">
            📱 Mobile
          </button>
        </div>
      </div>

      {/* Preview del email */}
      <div className="max-w-4xl mx-auto py-8 px-6">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Email metadata */}
          <div className="bg-slate-50 border-b border-slate-200 p-4 space-y-2 text-sm">
            <div>
              <span className="text-slate-500 font-semibold">De:</span>
              <span className="ml-2 text-slate-900">comercial@gard.cl</span>
            </div>
            <div>
              <span className="text-slate-500 font-semibold">Para:</span>
              <span className="ml-2 text-slate-900">{contactName} ({contactEmail})</span>
            </div>
            <div>
              <span className="text-slate-500 font-semibold">Asunto:</span>
              <span className="ml-2 text-slate-900">{quoteSubject} - Gard Security</span>
            </div>
          </div>

          {/* Email content en iframe */}
          <div className="p-4">
            <iframe
              src={`/api/email-preview/${sessionId}`}
              className="w-full h-[800px] border-0"
              title="Preview de Email"
            />
          </div>
        </div>

        {/* Info adicional */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-900 text-sm font-semibold mb-2">
            💡 Información del Preview
          </p>
          <ul className="text-blue-800 text-xs space-y-1">
            <li>• Este es el template que se enviará al cliente</li>
            <li>• Los datos son reales de la cotización de Zoho</li>
            <li>• El link público se generará al enviar el email</li>
            <li>• El diseño es responsive y se adapta a todos los dispositivos</li>
          </ul>
        </div>

        {/* Botón volver */}
        <div className="mt-6 flex justify-center">
          <a
            href="javascript:window.close()"
            className="px-6 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-semibold"
          >
            ← Volver al Preview
          </a>
        </div>
      </div>
    </div>
  );
}
