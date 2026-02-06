'use client';

/**
 * CaseStudyCard - Componente para mostrar casos de éxito
 * Usado en sección S19 (Resultados con Clientes)
 */

import { CaseStudy } from '@/types/presentation';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { Building2, Users, Calendar, Quote } from 'lucide-react';
import { KpiCard } from './KpiCard';

interface CaseStudyCardProps {
  caseStudy: CaseStudy;
  className?: string;
}

export function CaseStudyCard({ caseStudy, className }: CaseStudyCardProps) {
  const theme = useThemeClasses();
  
  return (
    <div
      className={cn(
        'rounded-lg border p-6',
        theme.border,
        theme.secondary,
        'transition-all hover:scale-[1.02]',
        className
      )}
    >
      {/* Header con sector */}
      <div className="mb-6">
        <div className={cn(
          'inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold mb-3',
          theme.accent,
          'text-white'
        )}>
          <Building2 className="w-4 h-4" />
          {caseStudy.sector}
        </div>
        
        {caseStudy.client_name && (
          <h3 className={cn('text-xl font-bold', theme.text)}>
            {caseStudy.client_name}
          </h3>
        )}
      </div>
      
      {/* Detalles del proyecto */}
      <div className={cn('grid grid-cols-3 gap-4 mb-6 pb-6 border-b', theme.border)}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className={cn('w-4 h-4', theme.accent.replace('bg-', 'text-'))} />
            <span className={cn('text-xs font-semibold', theme.textMuted)}>
              Instalaciones
            </span>
          </div>
          <div className={cn('text-2xl font-bold', theme.text)}>
            {caseStudy.sites}
          </div>
        </div>
        
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className={cn('w-4 h-4', theme.accent.replace('bg-', 'text-'))} />
            <span className={cn('text-xs font-semibold', theme.textMuted)}>
              Dotación
            </span>
          </div>
          <div className={cn('text-sm font-bold', theme.text)}>
            {caseStudy.staffing}
          </div>
        </div>
        
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Calendar className={cn('w-4 h-4', theme.accent.replace('bg-', 'text-'))} />
            <span className={cn('text-xs font-semibold', theme.textMuted)}>
              Duración
            </span>
          </div>
          <div className={cn('text-sm font-bold', theme.text)}>
            {caseStudy.duration}
          </div>
        </div>
      </div>
      
      {/* Métricas de resultados */}
      <div className="mb-6">
        <h4 className={cn('text-sm font-semibold mb-3', theme.text)}>
          Resultados
        </h4>
        <div className="grid grid-cols-2 gap-3">
          {caseStudy.metrics.map((metric, index) => (
            <KpiCard key={index} metric={metric} size="sm" />
          ))}
        </div>
      </div>
      
      {/* Quote/Testimonio */}
      {caseStudy.quote && (
        <div className={cn('relative p-4 rounded-lg', 'bg-opacity-50', theme.backgroundAlt)}>
          <Quote className={cn('w-6 h-6 mb-2 opacity-50', theme.accent.replace('bg-', 'text-'))} />
          <p className={cn('text-sm italic', theme.textMuted)}>
            "{caseStudy.quote}"
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Grid de casos de estudio
 */
interface CaseStudyGridProps {
  caseStudies: CaseStudy[];
  className?: string;
}

export function CaseStudyGrid({ caseStudies, className }: CaseStudyGridProps) {
  return (
    <div className={cn(
      'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6',
      className
    )}>
      {caseStudies.map((caseStudy, index) => (
        <CaseStudyCard key={index} caseStudy={caseStudy} />
      ))}
    </div>
  );
}
