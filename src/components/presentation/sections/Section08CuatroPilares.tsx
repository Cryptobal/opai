'use client';

/**
 * Section08CuatroPilares - 4 Pilares del modelo GARD
 * Framework estructurado del servicio
 */

import { Section08_4Pilares } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper, StaggerContainer, StaggerItem } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { Users, Eye, Shield, Target, CheckCircle2 } from 'lucide-react';

interface Section08CuatroPilaresProps {
  data: Section08_4Pilares;
}

export function Section08CuatroPilares({ data }: Section08CuatroPilaresProps) {
  const theme = useThemeClasses();
  
  const pillars = [
    { ...data.pillar1, icon: Users, number: 1 },
    { ...data.pillar2, icon: Eye, number: 2 },
    { ...data.pillar3, icon: Shield, number: 3 },
    { ...data.pillar4, icon: Target, number: 4 },
  ];
  
  return (
    <SectionWrapper id="s08-4-pilares" className={theme.backgroundAlt}>
      <ContainerWrapper size="xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className={cn('inline-block px-4 py-2 rounded-full text-sm font-semibold mb-4', theme.accent, 'text-white')}>
            Nuestro Modelo
          </div>
          
          <h2 className={cn('text-3xl md:text-5xl font-bold mb-4', theme.text, theme.headlineWeight)}>
            4 Pilares del servicio
          </h2>
          
          <p className={cn('text-lg md:text-xl max-w-2xl mx-auto', theme.textMuted)}>
            Framework estructurado que sostiene toda nuestra operación
          </p>
        </div>
        
        {/* Pillars grid */}
        <StaggerContainer className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {pillars.map((pillar, index) => {
            const Icon = pillar.icon;
            
            return (
              <StaggerItem key={index}>
                <div className={cn(
                  'relative p-8 rounded-lg border h-full',
                  theme.border,
                  theme.secondary,
                  'hover:scale-105 transition-all'
                )}>
                  {/* Number badge */}
                  <div className={cn(
                    'absolute -top-4 -left-4 w-12 h-12 rounded-full flex items-center justify-center',
                    theme.accent,
                    'text-white font-bold text-xl shadow-lg'
                  )}>
                    {pillar.number}
                  </div>
                  
                  {/* Icon */}
                  <Icon className={cn('w-12 h-12 mb-4', theme.accent.replace('bg-', 'text-'))} />
                  
                  {/* Content */}
                  <h3 className={cn('text-2xl font-bold mb-3', theme.text)}>
                    {pillar.title}
                  </h3>
                  
                  <p className={cn('text-base mb-4', theme.textMuted)}>
                    {pillar.description}
                  </p>
                  
                  {/* Details */}
                  <div className={cn('pt-4 border-t', theme.border)}>
                    <ul className="space-y-2">
                      {pillar.details.map((detail, i) => (
                        <li key={i} className={cn('text-sm flex items-start gap-2', theme.text)}>
                          <CheckCircle2 className={cn('w-4 h-4 flex-shrink-0 mt-0.5', theme.accent.replace('bg-', 'text-'))} />
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
        
        {/* Bottom message */}
        <div className="mt-12 text-center max-w-3xl mx-auto">
          <p className={cn('text-lg', theme.text)}>
            Estos 4 pilares trabajan en conjunto. Si falta uno, el sistema falla.
          </p>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
