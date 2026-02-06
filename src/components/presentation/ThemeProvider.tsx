'use client';

/**
 * Theme Provider para Presentaciones
 * Proporciona el contexto del theme a todos los componentes hijos
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { ThemeVariant } from '@/types';
import { ThemeConfig, getTheme } from '@/lib/themes';

interface ThemeContextValue {
  theme: ThemeConfig;
  variant: ThemeVariant;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  variant: ThemeVariant;
}

export function ThemeProvider({ children, variant }: ThemeProviderProps) {
  const theme = getTheme(variant);
  
  return (
    <ThemeContext.Provider value={{ theme, variant }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook para acceder al theme actual
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  
  if (!context) {
    throw new Error('useTheme debe usarse dentro de un ThemeProvider');
  }
  
  return context;
}

/**
 * Hook para obtener las clases CSS del theme actual
 */
export function useThemeClasses() {
  const { theme } = useTheme();
  
  return {
    // Backgrounds
    primary: theme.colors.primary,
    primaryHover: theme.colors.primaryHover,
    secondary: theme.colors.secondary,
    background: theme.colors.background,
    backgroundAlt: theme.colors.backgroundAlt,
    
    // Text
    text: theme.colors.text,
    textMuted: theme.colors.textMuted,
    
    // Accent
    accent: theme.colors.accent,
    accentHover: theme.colors.accentHover,
    
    // Border
    border: theme.colors.border,
    
    // Typography
    fontFamily: theme.typography.fontFamily,
    headlineWeight: theme.typography.headlineWeight,
    bodyWeight: theme.typography.bodyWeight,
  };
}

/**
 * Hook para verificar configuraciones del theme
 */
export function useThemeConfig() {
  const { theme } = useTheme();
  
  return {
    shouldShowDashboards: theme.emphasis.dashboards,
    shouldShowTimelines: theme.emphasis.timelines,
    shouldEmphasizePeople: theme.sections.emphasizePeople,
    shouldShowDetailedMetrics: theme.sections.showDetailedMetrics,
    imageryStyle: theme.emphasis.imagery,
    density: theme.density,
  };
}
