'use client';

/**
 * Preview Sidebar
 * 
 * Sidebar flotante con tabs para:
 * - Ver presentación
 * - Preview de email
 */

import { useState } from 'react';

interface PreviewSidebarProps {
  sessionId: string;
  zohoData: any;
  onTabChange?: (tab: 'presentation' | 'email') => void;
}

export function PreviewSidebar({ sessionId, zohoData, onTabChange }: PreviewSidebarProps) {
  const [activeTab, setActiveTab] = useState<'presentation' | 'email'>('presentation');
  const [isOpen, setIsOpen] = useState(false);

  const handleTabChange = (tab: 'presentation' | 'email') => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  // Extraer datos del contacto
  const contactName = `${zohoData.contact?.First_Name || ''} ${zohoData.contact?.Last_Name || ''}`.trim();
  const contactEmail = zohoData.contact?.Email || '';
  const quoteSubject = zohoData.quote?.Subject || 'Propuesta de Servicios';

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-20 right-4 z-50 bg-slate-900 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-slate-800 transition-colors border border-white/10"
      >
        {isOpen ? '✕ Cerrar' : '👁️ Vista'}
      </button>

      {/* Sidebar */}
      {isOpen && (
        <div className="fixed top-0 right-0 h-screen w-[600px] bg-slate-900 border-l border-white/10 z-40 shadow-2xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-teal-500 to-blue-500 p-4 flex-shrink-0">
            <h3 className="text-white font-bold text-lg">Opciones de Vista</h3>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/10 flex-shrink-0">
            <button
              onClick={() => handleTabChange('presentation')}
              className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors ${
                activeTab === 'presentation'
                  ? 'bg-teal-500 text-white'
                  : 'bg-slate-800 text-white/60 hover:text-white'
              }`}
            >
              📄 Presentación
            </button>
            <button
              onClick={() => handleTabChange('email')}
              className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors ${
                activeTab === 'email'
                  ? 'bg-teal-500 text-white'
                  : 'bg-slate-800 text-white/60 hover:text-white'
              }`}
            >
              📧 Email
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'presentation' && (
              <div className="p-4 text-white/80 text-sm">
                <div className="space-y-3">
                  <p className="text-white font-semibold">Vista de Presentación</p>
                  <p>Esta es la presentación completa que verá el cliente cuando abra el link público.</p>
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                    <p className="text-blue-200 text-xs">
                      💡 Scroll hacia abajo para ver todas las secciones de la presentación.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'email' && (
              <div className="h-full flex flex-col">
                {/* Email info */}
                <div className="p-4 space-y-2 text-xs bg-slate-800/50 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white/60 font-semibold">De:</span>
                    <span className="text-white">comercial@gard.cl</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-white/60 font-semibold">Para:</span>
                    <span className="text-white">{contactName} ({contactEmail})</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-white/60 font-semibold">Asunto:</span>
                    <span className="text-white">{quoteSubject} - Gard Security</span>
                  </div>
                </div>

                {/* Email preview iframe */}
                <div className="flex-1 bg-white overflow-auto">
                  <iframe
                    src={`/preview/${sessionId}/email-preview`}
                    className="w-full h-full border-0"
                    title="Preview de Email"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
