'use client';

/**
 * Section26PorqueEligen - Por qué nos eligen
 * Síntesis de valor + tasa de renovación
 */

import { Section26_PorQueEligen } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper, StaggerContainer, StaggerItem } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { CheckCircle2, Award } from 'lucide-react';

interface Section26PorqueEligenProps {
  data: Section26_PorQueEligen;
}

export function Section26PorqueEligen({ data }: Section26PorqueEligenProps) {
  const theme = useThemeClasses();
  
  return (
    <SectionWrapper id="s26-porque-eligen" className={theme.backgroundAlt}>
      <ContainerWrapper size="lg">
        {/* Header */}
        <div className="text-center mb-12">
          <Award className={cn('w-16 h-16 mx-auto mb-6', theme.accent.replace('bg-', 'text-'))} />
          
          <h2 className={cn('text-3xl md:text-5xl font-bold mb-4', theme.text, theme.headlineWeight)}>
            Por qué nos eligen
          </h2>
          
          <p className={cn('text-lg md:text-xl max-w-2xl mx-auto', theme.textMuted)}>
            Y por qué se quedan con nosotros
          </p>
        </div>
        
        {/* Reasons grid */}
        <StaggerContainer className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-12">
          {data.reasons.map((reason, index) => (
            <StaggerItem key={index}>
              <div className={cn(
                'flex items-start gap-4 p-6 rounded-lg border',
                theme.border,
                theme.secondary,
                'hover:scale-105 transition-all'
              )}>
                <CheckCircle2 className={cn('w-6 h-6 flex-shrink-0 mt-1', theme.accent.replace('bg-', 'text-'))} />
                <span className={cn('text-lg', theme.text)}>
                  {reason}
                </span>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
        
        {/* Renewal rate callout */}
        <div className={cn(
          'p-8 md:p-12 rounded-lg text-center max-w-3xl mx-auto',
          theme.accent
        )}>
          <p className="text-white/80 text-sm font-semibold uppercase tracking-wide mb-3">
            Tasa de Renovación
          </p>
          <p className="text-6xl md:text-7xl font-bold text-white mb-4">
            {data.renewal_rate.split('%')[0]}%
          </p>
          <p className="text-white/90 text-lg">
            de nuestros clientes renueva contrato
          </p>
          <p className="text-white/70 text-sm mt-4">
            Este es nuestro mejor indicador de satisfacción
          </p>
        </div>
        
        {/* Bottom message */}
        <div className="mt-12 text-center">
          <p className={cn('text-base max-w-2xl mx-auto', theme.textMuted)}>
            No competimos por el precio más bajo. Competimos por entregar el mejor valor: 
            <span className={cn('font-bold', theme.text)}> control real, transparencia total y resultados medibles</span>.
          </p>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
