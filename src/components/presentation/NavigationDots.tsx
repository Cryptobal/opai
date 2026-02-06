'use client';

/**
 * NavigationDots - Índice de navegación lateral con dots
 * Permite saltar entre secciones con scroll suave
 */

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

const SECTIONS = [
  { id: 's01-hero', label: 'Inicio' },
  { id: 's02-executive-summary', label: 'Resumen' },
  { id: 's03-transparencia', label: 'Transparencia' },
  { id: 's04-riesgo', label: 'Riesgo' },
  { id: 's07-sistema-capas', label: 'Sistema' },
  { id: 's08-4-pilares', label: '4 Pilares' },
  { id: 's11-reportabilidad', label: 'Reportes' },
  { id: 's19-resultados', label: 'Resultados' },
  { id: 's20-clientes', label: 'Clientes' },
  { id: 's23-propuesta-economica', label: 'Pricing' },
  { id: 's25-comparacion', label: 'Comparación' },
  { id: 's28-cierre', label: 'Contacto' },
];

export function NavigationDots() {
  const [activeSection, setActiveSection] = useState('s01-hero');
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    setIsVisible(true);
    
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
    
    SECTIONS.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });
    
    return () => observer.disconnect();
  }, []);
  
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  
  if (!isVisible) return null;
  
  return (
    <motion.nav
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 2, duration: 0.8 }}
      className="fixed right-8 top-1/2 -translate-y-1/2 z-50 hidden xl:block"
    >
      <div className="glass-card rounded-full px-3 py-6 border border-white/10 shadow-2xl">
        <div className="flex flex-col gap-4">
          {SECTIONS.map(({ id, label }) => {
            const isActive = activeSection === id;
            
            return (
              <button
                key={id}
                onClick={() => scrollToSection(id)}
                className="group relative"
                aria-label={label}
              >
                {/* Tooltip */}
                <div className={cn(
                  'absolute right-full mr-4 top-1/2 -translate-y-1/2',
                  'px-4 py-2 rounded-lg',
                  'glass-card border border-white/20',
                  'text-sm font-bold text-white whitespace-nowrap',
                  'opacity-0 group-hover:opacity-100',
                  'transition-all duration-300',
                  'pointer-events-none',
                  'shadow-xl'
                )}>
                  {label}
                </div>
                
                {/* Dot */}
                <div className="relative">
                  {isActive && (
                    <motion.div
                      layoutId="activeSection"
                      className="absolute inset-0 -m-2 bg-teal-500/30 rounded-full blur-lg"
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  )}
                  
                  <div className={cn(
                    'relative w-3 h-3 rounded-full transition-all duration-300',
                    isActive 
                      ? 'bg-gradient-to-br from-teal-400 to-teal-500 scale-150 shadow-lg shadow-teal-500/50' 
                      : 'bg-white/30 hover:bg-white/60 hover:scale-125'
                  )} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </motion.nav>
  );
}
