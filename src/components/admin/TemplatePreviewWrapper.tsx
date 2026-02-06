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
  const [showTokens, setShowTokens] = useState(showTokensByDefault);
  
  // Payload con theme fijo (executive)
  const displayPayload: PresentationPayload = {
    ...initialPayload,
    theme: initialTheme,
  };
  
  // Key solo basado en showTokens
  const renderKey = `render-${showTokens}`;
  
  return (
    <>
      {/* Sidebar de navegación */}
      <TemplateSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        showTokens={showTokens}
        onToggleTokens={() => setShowTokens(!showTokens)}
      />
      
      {/* Toggle button flotante */}
      <PreviewModeToggle
        isOpen={isSidebarOpen}
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      
      {/* Presentación */}
      <PresentationRenderer 
        key={renderKey} 
        payload={displayPayload}
        showTokens={showTokens}
      />
    </>
  );
}

