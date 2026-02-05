'use client';

/**
 * TemplateSidebar - Navegación lateral para modo admin/preview
 * Acordeón con grupos lógicos de secciones
 */

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { 
  ChevronDown, 
  ChevronRight, 
  Circle, 
  CheckCircle2,
  Palette,
  Eye,
  Code,
  Link as LinkIcon,
  X
} from 'lucide-react';
import { ThemeVariant } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';

interface Section {
  id: string;
  label: string;
}

interface SectionGroup {
  name: string;
  sections: Section[];
}

const SECTION_GROUPS: SectionGroup[] = [
  {
    name: 'INICIO',
    sections: [
      { id: 's01-hero', label: 'Hero / Portada' },
    ],
  },
  {
    name: 'PROPUESTA DE VALOR',
    sections: [
      { id: 's02-executive-summary', label: 'Executive Summary' },
      { id: 's03-transparencia', label: 'Transparencia' },
      { id: 's04-riesgo', label: 'El Riesgo Real' },
    ],
  },
  {
    name: 'PROBLEMA',
    sections: [
      { id: 's05-fallas-modelo', label: 'Fallas del Modelo' },
      { id: 's06-costo-real', label: 'Costo Real' },
    ],
  },
  {
    name: 'SOLUCIÓN',
    sections: [
      { id: 's07-sistema-capas', label: 'Sistema de Capas' },
      { id: 's08-4-pilares', label: '4 Pilares' },
      { id: 's09-como-operamos', label: 'Cómo Operamos' },
    ],
  },
  {
    name: 'OPERACIÓN',
    sections: [
      { id: 's10-supervision', label: 'Supervisión' },
      { id: 's11-reportabilidad', label: 'Reportabilidad' },
      { id: 's12-cumplimiento', label: 'Cumplimiento' },
    ],
  },
  {
    name: 'CREDENCIALES',
    sections: [
      { id: 's13-certificaciones', label: 'Certificaciones' },
      { id: 's14-tecnologia', label: 'Tecnología' },
      { id: 's15-seleccion', label: 'Selección Personal' },
      { id: 's16-nuestra-gente', label: 'Nuestra Gente' },
    ],
  },
  {
    name: 'GARANTÍAS',
    sections: [
      { id: 's17-continuidad', label: 'Continuidad' },
      { id: 's18-kpis', label: 'KPIs' },
    ],
  },
  {
    name: 'PRUEBA SOCIAL',
    sections: [
      { id: 's19-resultados', label: 'Casos de Éxito' },
      { id: 's20-clientes', label: 'Clientes' },
      { id: 's21-sectores', label: 'Sectores' },
    ],
  },
  {
    name: 'COMERCIAL',
    sections: [
      { id: 's22-tco', label: 'TCO' },
      { id: 's23-propuesta-economica', label: 'Pricing' },
      { id: 's24-terminos-condiciones', label: 'Términos' },
      { id: 's25-comparacion', label: 'Comparación' },
    ],
  },
  {
    name: 'CIERRE',
    sections: [
      { id: 's26-porque-eligen', label: 'Por Qué Eligen' },
      { id: 's27-implementacion', label: 'Implementación' },
      { id: 's28-cierre', label: 'CTA Final' },
    ],
  },
];

interface TemplateSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: ThemeVariant;
  onThemeChange: (theme: ThemeVariant) => void;
  showTokens: boolean;
  onToggleTokens: () => void;
}

export function TemplateSidebar({
  isOpen,
  onClose,
  currentTheme,
  onThemeChange,
  showTokens,
  onToggleTokens,
}: TemplateSidebarProps) {
  const [activeSection, setActiveSection] = useState('s01-hero');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['INICIO', 'PROPUESTA DE VALOR'])
  );
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { threshold: [0.5] }
    );
    
    SECTION_GROUPS.forEach((group) => {
      group.sections.forEach(({ id }) => {
        const element = document.getElementById(id);
        if (element) observer.observe(element);
      });
    });
    
    return () => observer.disconnect();
  }, []);
  
  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupName)) {
        newSet.delete(groupName);
      } else {
        newSet.add(groupName);
      }
      return newSet;
    });
  };
  
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  
  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
  };
  
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop (mobile) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          />
          
          {/* Sidebar */}
          <motion.aside
            initial={{ x: -320 }}
            animate={{ x: 0 }}
            exit={{ x: -320 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed left-0 top-0 bottom-0 w-80 bg-slate-950/95 backdrop-blur-xl border-r border-white/10 z-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div>
                <h2 className="text-lg font-black text-white">Preview Navigator</h2>
                <p className="text-xs text-white/50">Template: Commercial</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5 text-white/70" />
              </button>
            </div>
            
            {/* Controls */}
            <div className="p-4 space-y-3 border-b border-white/10">
              {/* Toggle tokens */}
              <button
                onClick={onToggleTokens}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all',
                  showTokens 
                    ? 'bg-amber-500/20 border border-amber-400/30' 
                    : 'bg-teal-500/20 border border-teal-400/30'
                )}
              >
                <div className="flex items-center gap-2">
                  <Code className="w-4 h-4" />
                  <span className="text-sm font-bold text-white">
                    {showTokens ? 'Mostrar tokens' : 'Datos de ejemplo'}
                  </span>
                </div>
                <div className={cn(
                  'w-10 h-6 rounded-full transition-colors relative',
                  showTokens ? 'bg-amber-500' : 'bg-teal-500'
                )}>
                  <div className={cn(
                    'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                    showTokens ? 'left-1' : 'left-5'
                  )} />
                </div>
              </button>
              
              {/* Theme selector */}
              <div>
                <label className="text-xs font-semibold text-white/70 uppercase tracking-wide mb-2 block">
                  Theme
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['executive', 'ops', 'trust'] as ThemeVariant[]).map((theme) => (
                    <button
                      key={theme}
                      onClick={() => onThemeChange(theme)}
                      className={cn(
                        'px-2 py-2 rounded-lg text-xs font-bold transition-all',
                        currentTheme === theme
                          ? 'bg-teal-500 text-white'
                          : 'bg-white/5 text-white/70 hover:bg-white/10'
                      )}
                    >
                      {theme === 'executive' && 'Exec'}
                      {theme === 'ops' && 'Ops'}
                      {theme === 'trust' && 'Trust'}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Copy link */}
              <button
                onClick={copyLink}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm font-semibold text-white/80"
              >
                <LinkIcon className="w-4 h-4" />
                Copiar link
              </button>
            </div>
            
            {/* Navigation */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {SECTION_GROUPS.map((group) => {
                const isExpanded = expandedGroups.has(group.name);
                
                return (
                  <div key={group.name}>
                    {/* Group header */}
                    <button
                      onClick={() => toggleGroup(group.name)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group"
                    >
                      <span className="text-xs font-black text-white/70 uppercase tracking-wider">
                        {group.name}
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-white/50" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-white/50" />
                      )}
                    </button>
                    
                    {/* Sections */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-1 mt-1 ml-2">
                            {group.sections.map((section) => {
                              const isActive = activeSection === section.id;
                              
                              return (
                                <button
                                  key={section.id}
                                  onClick={() => scrollToSection(section.id)}
                                  className={cn(
                                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-left',
                                    isActive
                                      ? 'bg-teal-500/20 border border-teal-400/30 text-white font-bold'
                                      : 'hover:bg-white/5 text-white/60 hover:text-white/90'
                                  )}
                                >
                                  {isActive ? (
                                    <CheckCircle2 className="w-4 h-4 text-teal-400 flex-shrink-0" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-white/30 flex-shrink-0" />
                                  )}
                                  <span className="text-sm">{section.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
            
            {/* Footer actions */}
            <div className="p-4 border-t border-white/10 space-y-2">
              <a
                href="/p/demo-polpaico-2026-02"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-400 hover:to-blue-400 transition-all text-sm font-bold text-white shadow-lg"
              >
                <Eye className="w-4 h-4" />
                Ver como cliente
              </a>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
