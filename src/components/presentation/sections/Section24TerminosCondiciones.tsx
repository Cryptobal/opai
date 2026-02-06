'use client';

/**
 * Section24TerminosCondiciones - Términos y condiciones operativas
 * Qué debe proveer el cliente vs qué incluye el servicio
 */

import { Section24_TerminosCondiciones } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { FileText, AlertCircle, CheckCircle2 } from 'lucide-react';

interface Section24TerminosCondicionesProps {
  data: Section24_TerminosCondiciones;
}

export function Section24TerminosCondiciones({ data }: Section24TerminosCondicionesProps) {
  const theme = useThemeClasses();
  
  return (
    <SectionWrapper id="s24-terminos-condiciones" className={theme.backgroundAlt}>
      <ContainerWrapper size="xl">
        {/* Header */}
        <div className="text-center mb-12">
          <FileText className={cn('w-16 h-16 mx-auto mb-6', theme.accent.replace('bg-', 'text-'))} />
          
          <h2 className={cn('text-3xl md:text-5xl font-bold mb-4', theme.text, theme.headlineWeight)}>
            Términos operativos
          </h2>
          
          <p className={cn('text-lg md:text-xl max-w-2xl mx-auto', theme.textMuted)}>
            Transparencia en qué necesitamos y qué incluimos
          </p>
        </div>
        
        {/* Two columns */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Client must provide */}
          <div className={cn('p-8 rounded-lg border', theme.border, 'bg-orange-900/5 border-orange-500/30')}>
            <div className="flex items-center gap-3 mb-6">
              <AlertCircle className="w-8 h-8 text-orange-500" />
              <h3 className={cn('text-xl font-bold', theme.text)}>
                El cliente debe proveer
              </h3>
            </div>
            
            <ul className="space-y-3">
              {data.client_must_provide.map((item, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-orange-500 mt-1">→</span>
                  <span className={cn('text-base', theme.textMuted)}>
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Service includes */}
          <div className={cn('p-8 rounded-lg border', theme.border, theme.accent, 'bg-opacity-5')}>
            <div className="flex items-center gap-3 mb-6">
              <CheckCircle2 className={cn('w-8 h-8', theme.accent.replace('bg-', 'text-'))} />
              <h3 className={cn('text-xl font-bold', theme.text)}>
                El servicio incluye
              </h3>
            </div>
            
            <ul className="space-y-3">
              {data.service_includes.map((item, index) => (
                <li key={index} className="flex items-start gap-2">
                  <CheckCircle2 className={cn('w-5 h-5 flex-shrink-0 mt-0.5', theme.accent.replace('bg-', 'text-'))} />
                  <span className={cn('text-base', theme.text)}>
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        {/* Bottom note */}
        <div className="mt-12 text-center max-w-3xl mx-auto">
          <p className={cn('text-sm', theme.textMuted)}>
            Estas condiciones se establecen en el contrato. Para casos especiales, podemos negociar ajustes.
          </p>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
