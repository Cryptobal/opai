'use client';

/**
 * Section12Cumplimiento - Cumplimiento laboral y legal
 * Tranquilidad operativa, legal y financiera
 */

import { Section12_Cumplimiento } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { ShieldCheck, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

interface Section12CumplimientoProps {
  data: Section12_Cumplimiento;
}

export function Section12Cumplimiento({ data }: Section12CumplimientoProps) {
  const theme = useThemeClasses();
  
  return (
    <SectionWrapper id="s12-cumplimiento">
      <ContainerWrapper size="xl">
        {/* Header */}
        <div className="text-center mb-12">
          <ShieldCheck className={cn('w-16 h-16 mx-auto mb-6', theme.accent.replace('bg-', 'text-'))} />
          
          <h2 className={cn('text-3xl md:text-5xl font-bold mb-4', theme.text, theme.headlineWeight)}>
            {data.intro_text}
          </h2>
        </div>
        
        {/* Two columns: Risks vs Guarantees */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto mb-12">
          {/* Risks */}
          <div className={cn('p-8 rounded-lg border border-red-500/30', 'bg-red-900/5')}>
            <div className="flex items-center gap-3 mb-6">
              <AlertTriangle className="w-8 h-8 text-red-500" />
              <h3 className={cn('text-xl font-bold', theme.text)}>
                Qué puede salir mal
              </h3>
            </div>
            
            <ul className="space-y-3">
              {data.risks.map((risk, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-red-500 mt-1">✗</span>
                  <span className={cn('text-base', theme.textMuted)}>
                    {risk}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Guarantees */}
          <div className={cn('p-8 rounded-lg border', theme.border, theme.accent, 'bg-opacity-5')}>
            <div className="flex items-center gap-3 mb-6">
              <CheckCircle2 className={cn('w-8 h-8', theme.accent.replace('bg-', 'text-'))} />
              <h3 className={cn('text-xl font-bold', theme.text)}>
                Qué garantizamos
              </h3>
            </div>
            
            <ul className="space-y-3">
              {data.guarantees.map((guarantee, index) => (
                <li key={index} className="flex items-start gap-2">
                  <CheckCircle2 className={cn('w-5 h-5 flex-shrink-0 mt-0.5', theme.accent.replace('bg-', 'text-'))} />
                  <span className={cn('text-base', theme.text)}>
                    {guarantee}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        {/* Commitment callout */}
        <div className={cn(
          'p-8 rounded-lg border text-center max-w-3xl mx-auto',
          theme.border,
          theme.accent
        )}>
          <Clock className="w-12 h-12 mx-auto mb-4 text-white" />
          <h3 className="text-2xl font-bold text-white mb-3">
            Compromiso de respuesta
          </h3>
          <p className="text-xl text-white/90 mb-2">
            {data.commitment_time}
          </p>
          <p className="text-white/70 text-sm">
            Si la DT solicita documentación, la tendrás en tu email en menos de 24 horas hábiles
          </p>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
