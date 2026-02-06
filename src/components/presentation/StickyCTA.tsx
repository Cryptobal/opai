'use client';

/**
 * StickyCTA - CTA persistente en mobile (bottom sticky)
 * Solo visible en mobile, oculto en desktop
 */

import { useThemeClasses } from './ThemeProvider';
import { cn } from '@/lib/utils';
import { CTALinks } from '@/types';
import { Calendar, MessageCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

interface StickyCTAProps {
  cta: CTALinks;
  className?: string;
}

export function StickyCTA({ cta, className }: StickyCTAProps) {
  const theme = useThemeClasses();
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
    
    // Mostrar CTA después de scroll inicial
    const handleScroll = () => {
      setIsVisible(window.scrollY > 300);
    };
    
    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check inicial
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  if (!isMounted) return null;
  
  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40',
        'md:hidden', // Solo visible en mobile
        'border-t',
        theme.border,
        'backdrop-blur-lg',
        theme.backgroundAlt,
        'shadow-lg',
        'transition-transform duration-300',
        isVisible ? 'translate-y-0' : 'translate-y-full',
        className
      )}
      style={{ opacity: isVisible ? 1 : 0 }}
    >
      <div className="container mx-auto px-4 py-3">
        <div className="flex gap-3">
          {/* Botón principal - Agendar */}
          <a
            href={cta.meeting_link}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex-1',
              'inline-flex items-center justify-center gap-2',
              'px-4 py-3 rounded-lg',
              'text-sm font-semibold text-white',
              theme.accent,
              theme.accentHover,
              'transition-all active:scale-95',
              'shadow-md'
            )}
          >
            <Calendar className="w-4 h-4" />
            Agendar visita
          </a>
          
          {/* Botón secundario - WhatsApp */}
          {cta.whatsapp_link && (
            <a
              href={cta.whatsapp_link}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'px-4 py-3 rounded-lg',
                'border-2',
                theme.border,
                theme.text,
                'hover:' + theme.accent.replace('bg-', 'bg-'),
                'hover:text-white hover:border-transparent',
                'transition-all active:scale-95',
                'flex items-center justify-center'
              )}
            >
              <MessageCircle className="w-5 h-5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
