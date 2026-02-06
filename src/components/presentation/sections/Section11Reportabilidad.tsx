'use client';

/**
 * Section11Reportabilidad - Reportes ejecutivos en 3 niveles
 * Diario, semanal, mensual
 */

import { Section11_Reportabilidad } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper, StaggerContainer, StaggerItem } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { FileText, TrendingUp, BarChart3, CheckCircle2 } from 'lucide-react';

interface Section11ReportabilidadProps {
  data: Section11_Reportabilidad;
}

export function Section11Reportabilidad({ data }: Section11ReportabilidadProps) {
  const theme = useThemeClasses();
  
  const reports = [
    {
      icon: FileText,
      title: data.daily.title,
      items: data.daily.items,
      frequency: 'Todos los días',
      color: 'text-blue-500'
    },
    {
      icon: TrendingUp,
      title: data.weekly.title,
      items: data.weekly.items,
      frequency: 'Cada semana',
      color: 'text-green-500'
    },
    {
      icon: BarChart3,
      title: data.monthly.title,
      items: data.monthly.items,
      frequency: 'Mensual',
      color: 'text-purple-500'
    }
  ];
  
  return (
    <SectionWrapper id="s11-reportabilidad" className={theme.backgroundAlt}>
      <ContainerWrapper size="xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className={cn('inline-block px-4 py-2 rounded-full text-sm font-semibold mb-4', theme.accent, 'text-white')}>
            Reportabilidad Ejecutiva
          </div>
          
          <h2 className={cn('text-3xl md:text-5xl font-bold mb-4', theme.text, theme.headlineWeight)}>
            Información cuando la necesitas
          </h2>
          
          <p className={cn('text-lg md:text-xl max-w-3xl mx-auto', theme.textMuted)}>
            Tres niveles de reportabilidad para diferentes necesidades: operativo, táctico y estratégico
          </p>
        </div>
        
        {/* Reports grid */}
        <StaggerContainer className="grid md:grid-cols-3 gap-6 mb-12">
          {reports.map((report, index) => {
            const Icon = report.icon;
            
            return (
              <StaggerItem key={index}>
                <div className={cn(
                  'p-6 rounded-lg border h-full',
                  theme.border,
                  theme.secondary
                )}>
                  <div className="flex items-center gap-3 mb-4">
                    <Icon className={cn('w-8 h-8', report.color)} />
                    <div>
                      <h3 className={cn('text-lg font-bold', theme.text)}>
                        {report.title}
                      </h3>
                      <p className={cn('text-xs', theme.textMuted)}>
                        {report.frequency}
                      </p>
                    </div>
                  </div>
                  
                  <ul className="space-y-2">
                    {report.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className={cn('w-4 h-4 flex-shrink-0 mt-0.5', report.color)} />
                        <span className={cn('text-sm', theme.textMuted)}>
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
        
        {/* Dashboard preview message */}
        <div className={cn('p-8 rounded-lg border text-center max-w-3xl mx-auto', theme.border, theme.secondary)}>
          <BarChart3 className={cn('w-12 h-12 mx-auto mb-4', theme.accent.replace('bg-', 'text-'))} />
          <h3 className={cn('text-xl font-bold mb-3', theme.text)}>
            Dashboard Ejecutivo
          </h3>
          <p className={cn('text-base mb-4', theme.textMuted)}>
            Acceso web 24/7 a tu dashboard personalizado con KPIs en tiempo real, 
            historial de incidentes y análisis de tendencias
          </p>
          <div className={cn('inline-block px-4 py-2 rounded-full text-sm', theme.accent, 'bg-opacity-20', theme.accent.replace('bg-', 'text-'))}>
            Incluido en el servicio
          </div>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
