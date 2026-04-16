'use client';

/**
 * @deprecated DESDE: 2026-04-16
 *
 * Este módulo forma parte del Sistema de Presentación Comercial de 29 secciones,
 * que NO se muestra al cliente final. El flujo activo de envío al cliente usa
 * el Portal del Cliente (ver `sendQuoteToPortal()` en
 * `src/modules/cpq/send/send-quote-to-portal.ts`).
 *
 * NO USAR EN CÓDIGO NUEVO. Este archivo será eliminado después de
 * 2026-06-15 una vez confirmada estabilidad.
 *
 * Ver: src/lib/_deprecated/README.md
 */

/**
 * Section03Transparencia - Compromiso de transparencia
 * Protocolo de respuesta a incidentes con SLA
 */

import { Section03_Transparencia } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { KpiGrid } from '../shared/KpiCard';
import { Eye, Bell, Zap } from 'lucide-react';

interface Section03TransparenciaProps {
  data: Section03_Transparencia;
}

export function Section03Transparencia({ data }: Section03TransparenciaProps) {
  const theme = useThemeClasses();
  
  return (
    <SectionWrapper id="s03-transparencia">
      <ContainerWrapper size="lg">
        {/* Main phrase */}
        <div className="text-center mb-16">
          <h2 className={cn(
            'text-3xl md:text-5xl lg:text-6xl font-bold mb-8',
            theme.text,
            theme.headlineWeight
          )}>
            {data.main_phrase}
          </h2>
        </div>
        
        {/* Protocol timeline */}
        <div className="max-w-4xl mx-auto mb-16">
          <h3 className={cn('text-2xl font-bold text-center mb-8', theme.text)}>
            Protocolo de Respuesta a Incidentes
          </h3>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div className={cn('p-6 rounded-lg border text-center', theme.border, theme.secondary)}>
              <Eye className={cn('w-12 h-12 mx-auto mb-4', theme.accent.replace('bg-', 'text-'))} />
              <h4 className={cn('text-lg font-bold mb-2', theme.text)}>
                Detección
              </h4>
              <p className={cn('text-3xl font-bold mb-2', theme.accent.replace('bg-', 'text-'))}>
                {data.protocol_steps.detection}
              </p>
              <p className={cn('text-sm', theme.textMuted)}>
                Identificación del evento
              </p>
            </div>
            
            <div className={cn('p-6 rounded-lg border text-center', theme.border, theme.secondary)}>
              <Bell className={cn('w-12 h-12 mx-auto mb-4', theme.accent.replace('bg-', 'text-'))} />
              <h4 className={cn('text-lg font-bold mb-2', theme.text)}>
                Reporte
              </h4>
              <p className={cn('text-3xl font-bold mb-2', theme.accent.replace('bg-', 'text-'))}>
                {data.protocol_steps.report}
              </p>
              <p className={cn('text-sm', theme.textMuted)}>
                Notificación al cliente
              </p>
            </div>
            
            <div className={cn('p-6 rounded-lg border text-center', theme.border, theme.secondary)}>
              <Zap className={cn('w-12 h-12 mx-auto mb-4', theme.accent.replace('bg-', 'text-'))} />
              <h4 className={cn('text-lg font-bold mb-2', theme.text)}>
                Acción
              </h4>
              <p className={cn('text-3xl font-bold mb-2', theme.accent.replace('bg-', 'text-'))}>
                {data.protocol_steps.action}
              </p>
              <p className={cn('text-sm', theme.textMuted)}>
                Respuesta coordinada
              </p>
            </div>
          </div>
        </div>
        
        {/* KPIs */}
        <div className="max-w-4xl mx-auto">
          <h3 className={cn('text-2xl font-bold text-center mb-8', theme.text)}>
            Resultados del protocolo
          </h3>
          <KpiGrid metrics={data.kpis} columns={3} />
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
