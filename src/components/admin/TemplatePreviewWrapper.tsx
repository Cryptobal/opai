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
  
  // Crear payload con theme actualizado
  const displayPayload: PresentationPayload = {
    ...initialPayload,
    theme: currentTheme,
  };
  
  // Key para forzar re-render
  const renderKey = `${currentTheme}-${showTokens}`;
  
  return (
    <>
      {/* Sidebar de navegación */}
      <TemplateSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        currentTheme={currentTheme}
        onThemeChange={(newTheme) => {
          console.log('Changing theme to:', newTheme);
          setCurrentTheme(newTheme);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        showTokens={showTokens}
        onToggleTokens={() => setShowTokens(!showTokens)}
      />
      
      {/* Toggle button flotante */}
      <PreviewModeToggle
        isOpen={isSidebarOpen}
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      
      {/* Presentación - key para forzar re-render */}
      <PresentationRenderer 
        key={renderKey} 
        payload={displayPayload}
        showTokens={showTokens}
      />
    </>
  );
}

