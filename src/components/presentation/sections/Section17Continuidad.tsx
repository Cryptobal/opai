'use client';

/**
 * Section17Continuidad - Continuidad del servicio
 * 4 escenarios de contingencia + SLA
 */

import { Section17_Continuidad } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper, StaggerContainer, StaggerItem } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { RefreshCw, Clock, AlertCircle, TrendingUp } from 'lucide-react';
import { TrustBadges } from '../shared/TrustBadges';

interface Section17ContinuidadProps {
  data: Section17_Continuidad;
}

export function Section17Continuidad({ data }: Section17ContinuidadProps) {
  const theme = useThemeClasses();
  
  const icons = [Clock, AlertCircle, AlertCircle, TrendingUp];
  
  return (
    <SectionWrapper id="s17-continuidad">
      <ContainerWrapper size="xl">
        {/* Header */}
        <div className="text-center mb-12">
          <RefreshCw className={cn('w-16 h-16 mx-auto mb-6', theme.accent.replace('bg-', 'text-'))} />
          
          <h2 className={cn('text-3xl md:text-5xl font-bold mb-4', theme.text, theme.headlineWeight)}>
            Continuidad del servicio
          </h2>
          
          <p className={cn('text-lg md:text-xl max-w-2xl mx-auto', theme.textMuted)}>
            Planes de contingencia para cualquier escenario
          </p>
        </div>
        
        {/* Scenarios grid */}
        <StaggerContainer className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto mb-12">
          {data.scenarios.map((scenario, index) => {
            const Icon = icons[index];
            
            return (
              <StaggerItem key={index}>
                <div className={cn(
                  'p-6 rounded-lg border h-full',
                  theme.border,
                  theme.secondary
                )}>
                  <Icon className={cn('w-10 h-10 mb-4', theme.accent.replace('bg-', 'text-'))} />
                  
                  <h3 className={cn('text-xl font-bold mb-2', theme.text)}>
                    {scenario.title}
                  </h3>
                  
                  <p className={cn('text-base mb-4', theme.textMuted)}>
                    {scenario.description}
                  </p>
                  
                  <div className={cn('pt-4 border-t', theme.border)}>
                    <p className={cn('text-xs font-semibold mb-1', theme.textMuted)}>
                      Tiempo de respuesta:
                    </p>
                    <p className={cn('text-base font-bold', theme.accent.replace('bg-', 'text-'))}>
                      {scenario.response_time}
                    </p>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
        
        {/* SLA guarantees */}
        <div className="max-w-4xl mx-auto">
          <div className={cn('p-8 rounded-lg border', theme.border, theme.accent)}>
            <h3 className="text-2xl font-bold text-white text-center mb-6">
              Garantías de servicio
            </h3>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="text-center">
                <p className="text-white/80 text-sm mb-2">SLA de Cobertura</p>
                <p className="text-4xl font-bold text-white mb-1">
                  {data.sla_coverage.split(' ')[0]}
                </p>
                <p className="text-white/70 text-sm">
                  {data.sla_coverage}
                </p>
              </div>
              
              <div className="text-center">
                <p className="text-white/80 text-sm mb-2">Cumplimiento</p>
                <p className="text-4xl font-bold text-white mb-1">
                  {data.kpi_compliance.split(' ')[0]}
                </p>
                <p className="text-white/70 text-sm">
                  {data.kpi_compliance}
                </p>
              </div>
            </div>
          </div>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
