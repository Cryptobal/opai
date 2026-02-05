'use client';

/**
 * TemplatePreviewWrapper - Wrapper para modo preview de templates
 * Maneja estado de sidebar, tokens y theme
 */

import { useState } from 'react';
import { PresentationPayload } from '@/types/presentation';
import { ThemeVariant } from '@/types';
import { PresentationRenderer } from '../presentation/PresentationRenderer';
import { TemplateSidebar } from './TemplateSidebar';
import { PreviewModeToggle } from './PreviewModeToggle';

interface TemplatePreviewWrapperProps {
  payload: PresentationPayload;
  initialTheme?: ThemeVariant;
  showTokensByDefault?: boolean;
}

export function TemplatePreviewWrapper({
  payload: initialPayload,
  initialTheme = 'executive',
  showTokensByDefault = false,
}: TemplatePreviewWrapperProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<ThemeVariant>(initialTheme);
  const [showTokens, setShowTokens] = useState(showTokensByDefault);
  
  // Crear payload con o sin tokens reemplazados
  const displayPayload: PresentationPayload = showTokens 
    ? createTokenizedPayload(initialPayload)
    : initialPayload;
  
  // Actualizar theme del payload
  displayPayload.theme = currentTheme;
  
  return (
    <>
      {/* Sidebar de navegación */}
      <TemplateSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        currentTheme={currentTheme}
        onThemeChange={setCurrentTheme}
        showTokens={showTokens}
        onToggleTokens={() => setShowTokens(!showTokens)}
      />
      
      {/* Toggle button flotante */}
      <PreviewModeToggle
        isOpen={isSidebarOpen}
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      
      {/* Presentación */}
      <PresentationRenderer payload={displayPayload} />
      
      {/* Indicator de modo preview */}
      <div className="fixed top-20 right-4 z-40 px-4 py-2 rounded-full glass-card border border-amber-400/30 text-xs font-bold text-amber-400 shadow-lg">
        🔧 PREVIEW MODE
      </div>
    </>
  );
}

/**
 * Crea un payload con tokens visibles (sin reemplazar)
 */
function createTokenizedPayload(payload: PresentationPayload): PresentationPayload {
  return {
    ...payload,
    client: {
      ...payload.client,
      company_name: '[ACCOUNT_NAME]',
      contact_name: '[CONTACT_NAME]',
      contact_first_name: '[CONTACT_FIRST_NAME]',
      contact_email: '[CONTACT_EMAIL]',
      contact_phone: '[CONTACT_PHONE]',
    },
    quote: {
      ...payload.quote,
      number: '[QUOTE_NUMBER]',
      date: '[CURRENT_DATE]',
      total: 0, // Se mostrará como [QUOTE_TOTAL] en el componente
    },
    // Los sections se mantienen igual (ya tienen los textos con tokens)
  };
}
