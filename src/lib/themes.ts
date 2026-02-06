/**
 * Sistema de Themes para Presentaciones
 * Define 3 variantes visuales según Presentacion-Comercial.md:
 * - Executive Dark Premium: máxima sobriedad, CFO-friendly
 * - Ops & Control: más dashboards, timelines, KPIs visibles
 * - Trust & People: más foco en selección, continuidad, fotos reales
 */

import { ThemeVariant } from '@/types';

export interface ThemeConfig {
  id: ThemeVariant;
  name: string;
  description: string;
  
  // Colores principales
  colors: {
    primary: string;
    primaryHover: string;
    secondary: string;
    accent: string;
    accentHover: string;
    background: string;
    backgroundAlt: string;
    text: string;
    textMuted: string;
    border: string;
  };
  
  // Tipografía
  typography: {
    fontFamily: string;
    headlineWeight: string;
    bodyWeight: string;
  };
  
  // Densidad visual
  density: 'low' | 'medium' | 'high';
  
  // Énfasis en componentes
  emphasis: {
    dashboards: boolean;    // Mostrar más KPIs y métricas
    timelines: boolean;     // Énfasis en procesos y secuencias
    imagery: 'minimal' | 'balanced' | 'people-focused';
    dataVisualization: boolean;  // Gráficos y tablas destacados
  };
  
  // Configuración de secciones
  sections: {
    showDetailedMetrics: boolean;
    emphasizeCompliance: boolean;
    emphasizePeople: boolean;
  };
}

/**
 * V1 — Executive Dark Premium
 * Máxima sobriedad, CFO-friendly
 */
const executiveTheme: ThemeConfig = {
  id: 'executive',
  name: 'Executive Dark Premium',
  description: 'Diseño sobrio y premium orientado a CFOs y alta dirección',
  
  colors: {
    primary: 'bg-gradient-to-br from-slate-900 to-slate-800',
    primaryHover: 'hover:from-slate-800 hover:to-slate-700',
    secondary: 'bg-slate-800/50',
    accent: 'bg-gradient-to-r from-teal-500 to-teal-400',
    accentHover: 'hover:from-teal-400 hover:to-teal-300',
    background: 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950',
    backgroundAlt: 'bg-gradient-to-br from-slate-900/50 via-slate-800/30 to-slate-900/50',
    text: 'text-white',
    textMuted: 'text-slate-300',
    border: 'border-white/10',
  },
  
  typography: {
    fontFamily: 'font-serif',
    headlineWeight: 'font-bold',
    bodyWeight: 'font-normal',
  },
  
  density: 'low',  // Más espacio en blanco
  
  emphasis: {
    dashboards: false,
    timelines: true,
    imagery: 'minimal',
    dataVisualization: false,
  },
  
  sections: {
    showDetailedMetrics: false,  // Solo KPIs principales
    emphasizeCompliance: true,   // Énfasis en cumplimiento
    emphasizePeople: false,
  },
};

/**
 * V2 — Ops & Control
 * Más dashboards, timelines, KPIs visibles
 */
const opsTheme: ThemeConfig = {
  id: 'ops',
  name: 'Ops & Control',
  description: 'Orientado a operaciones con énfasis en métricas y control',
  
  colors: {
    primary: 'bg-gradient-to-br from-blue-900 to-blue-800',
    primaryHover: 'hover:from-blue-800 hover:to-blue-700',
    secondary: 'bg-blue-900/50',
    accent: 'bg-gradient-to-r from-green-500 to-emerald-400',
    accentHover: 'hover:from-green-400 hover:to-emerald-300',
    background: 'bg-gradient-to-br from-blue-950 via-blue-900 to-slate-900',
    backgroundAlt: 'bg-gradient-to-br from-blue-900/50 via-blue-800/30 to-slate-900/50',
    text: 'text-white',
    textMuted: 'text-blue-200',
    border: 'border-blue-500/20',
  },
  
  typography: {
    fontFamily: 'font-sans',
    headlineWeight: 'font-extrabold',
    bodyWeight: 'font-normal',
  },
  
  density: 'high',  // Más información visible
  
  emphasis: {
    dashboards: true,       // Destacar KPIs y métricas
    timelines: true,        // Procesos visibles
    imagery: 'minimal',
    dataVisualization: true,  // Gráficos y tablas prominentes
  },
  
  sections: {
    showDetailedMetrics: true,   // Mostrar todos los KPIs
    emphasizeCompliance: true,
    emphasizePeople: false,
  },
};

/**
 * V3 — Trust & People
 * Más foco en selección, continuidad, fotos reales
 */
const trustTheme: ThemeConfig = {
  id: 'trust',
  name: 'Trust & People',
  description: 'Enfoque humano con énfasis en equipo y cultura organizacional',
  
  colors: {
    primary: 'bg-gradient-to-br from-indigo-900 to-indigo-800',
    primaryHover: 'hover:from-indigo-800 hover:to-indigo-700',
    secondary: 'bg-indigo-900/50',
    accent: 'bg-gradient-to-r from-amber-400 to-orange-400',
    accentHover: 'hover:from-amber-300 hover:to-orange-300',
    background: 'bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900',
    backgroundAlt: 'bg-gradient-to-br from-indigo-900/50 via-indigo-800/30 to-slate-900/50',
    text: 'text-white',
    textMuted: 'text-indigo-200',
    border: 'border-indigo-500/20',
  },
  
  typography: {
    fontFamily: 'font-sans',
    headlineWeight: 'font-bold',
    bodyWeight: 'font-normal',
  },
  
  density: 'medium',
  
  emphasis: {
    dashboards: false,
    timelines: true,
    imagery: 'people-focused',  // Más fotos de guardias
    dataVisualization: false,
  },
  
  sections: {
    showDetailedMetrics: false,
    emphasizeCompliance: true,
    emphasizePeople: true,  // Destacar selección y cultura
  },
};

/**
 * Registro de todos los themes disponibles
 */
export const themes: Record<ThemeVariant, ThemeConfig> = {
  executive: executiveTheme,
  ops: opsTheme,
  trust: trustTheme,
};

/**
 * Obtiene la configuración de un theme específico
 */
export function getTheme(variant: ThemeVariant): ThemeConfig {
  return themes[variant] || themes.executive;
}

/**
 * Verifica si un theme debe mostrar dashboards
 */
export function shouldShowDashboards(variant: ThemeVariant): boolean {
  return themes[variant]?.emphasis.dashboards ?? false;
}

/**
 * Verifica si un theme debe enfatizar personas
 */
export function shouldEmphasizePeople(variant: ThemeVariant): boolean {
  return themes[variant]?.sections.emphasizePeople ?? false;
}

/**
 * Obtiene las clases CSS para un theme específico
 */
export function getThemeClasses(variant: ThemeVariant) {
  const theme = getTheme(variant);
  
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
 * Genera clase CSS completa para una sección según el theme
 */
export function getSectionClasses(variant: ThemeVariant, sectionId: string): string {
  const theme = getTheme(variant);
  const classes = getThemeClasses(variant);
  
  // Clases base para todas las secciones
  const baseClasses = [
    'section-container',
    'py-16 md:py-24',
    classes.text,
  ];
  
  // Aplicar background alternado según ID de sección
  const sectionNumber = parseInt(sectionId.replace('s', ''));
  const isEven = sectionNumber % 2 === 0;
  
  if (isEven) {
    baseClasses.push(classes.backgroundAlt);
  }
  
  return baseClasses.join(' ');
}
