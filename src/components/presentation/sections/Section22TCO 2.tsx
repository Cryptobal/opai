'use client';

/**
 * Section22TCO - Costo Total de Propiedad
 * Comparación de TCO entre low-cost vs controlled-cost
 */

import { Section22_TCO } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import { AlertTriangle, Shield, TrendingDown, TrendingUp } from 'lucide-react';

interface Section22TCOProps {
  data: Section22_TCO;
}

export function Section22TCO({ data }: Section22TCOProps) {
  const theme = useThemeClasses();
  const { comparison_columns } = data;
  
  return (
    <SectionWrapper id="s22-tco">
      <ContainerWrapper size="xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className={cn('inline-block px-4 py-2 rounded-full text-sm font-semibold mb-4', theme.accent, 'text-white')}>
            Análisis TCO
          </div>
          
          <h2 className={cn('text-3xl md:text-5xl font-bold mb-4', theme.text, theme.headlineWeight)}>
            El verdadero costo de la seguridad
          </h2>
          
          <p className={cn('text-xl md:text-2xl max-w-3xl mx-auto mb-6', theme.textMuted)}>
            {data.message}
          </p>
        </div>
        
        {/* Comparison cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Low cost, high risk */}
          <div className={cn(
            'p-8 rounded-lg border-2 border-red-500/30',
            'bg-red-900/5'
          )}>
            <div className="flex items-center gap-3 mb-6">
              <AlertTriangle className="w-8 h-8 text-red-500" />
              <div>
                <h3 className={cn('text-2xl font-bold', theme.text)}>
                  Costo Bajo + Alto Riesgo
                </h3>
                <p className={cn('text-sm', theme.textMuted)}>
                  Modelo tradicional
                </p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-baseline">
                <span className={cn('text-sm', theme.textMuted)}>Tarifa mensual</span>
                <span className={cn('text-lg font-bold', theme.text)}>
                  {formatCurrency(comparison_columns.low_cost_high_risk.monthly_rate)}
                </span>
              </div>
              
              <div className="flex justify-between items-baseline">
                <span className={cn('text-sm', theme.textMuted)}>Tarifa anual</span>
                <span className={cn('text-base', theme.text)}>
                  {formatCurrency(comparison_columns.low_cost_high_risk.annual_rate)}
                </span>
              </div>
              
              <div className={cn('flex justify-between items-baseline pt-4 border-t', theme.border)}>
                <span className={cn('text-sm font-semibold text-red-500')}>
                  Costos ocultos estimados
                </span>
                <span className="text-lg font-bold text-red-500 flex items-center gap-1">
                  <TrendingUp className="w-5 h-5" />
                  {formatCurrency(comparison_columns.low_cost_high_risk.hidden_costs)}
                </span>
              </div>
              
              <div className={cn('flex justify-between items-baseline pt-4 border-t-2', theme.border)}>
                <span className={cn('text-base font-bold', theme.text)}>
                  TOTAL REAL 12 meses
                </span>
                <span className="text-2xl font-bold text-red-500">
                  {formatCurrency(comparison_columns.low_cost_high_risk.total_real)}
                </span>
              </div>
            </div>
            
            <div className="mt-6 p-4 rounded bg-red-500/10">
              <p className={cn('text-xs', theme.textMuted)}>
                Incluye: incidentes, rotación, multas, tiempo gerencial, riesgo reputacional
              </p>
            </div>
          </div>
          
          {/* Controlled cost, low risk */}
          <div className={cn(
            'p-8 rounded-lg border-2',
            theme.accent.replace('bg-', 'border-'),
            theme.accent.replace('bg-', 'bg-'),
            'bg-opacity-5'
          )}>
            <div className="flex items-center gap-3 mb-6">
              <Shield className={cn('w-8 h-8', theme.accent.replace('bg-', 'text-'))} />
              <div>
                <h3 className={cn('text-2xl font-bold', theme.text)}>
                  Costo Controlado + Bajo Riesgo
                </h3>
                <p className={cn('text-sm', theme.textMuted)}>
                  Modelo GARD
                </p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-baseline">
                <span className={cn('text-sm', theme.textMuted)}>Tarifa mensual</span>
                <span className={cn('text-lg font-bold', theme.text)}>
                  {formatCurrency(comparison_columns.controlled_cost_low_risk.monthly_rate)}
                </span>
              </div>
              
              <div className="flex justify-between items-baseline">
                <span className={cn('text-sm', theme.textMuted)}>Tarifa anual</span>
                <span className={cn('text-base', theme.text)}>
                  {formatCurrency(comparison_columns.controlled_cost_low_risk.annual_rate)}
                </span>
              </div>
              
              <div className={cn('flex justify-between items-baseline pt-4 border-t', theme.border)}>
                <span className={cn('text-sm font-semibold', theme.accent.replace('bg-', 'text-'))}>
                  Costos ocultos estimados
                </span>
                <span className={cn('text-lg font-bold flex items-center gap-1', theme.accent.replace('bg-', 'text-'))}>
                  <TrendingDown className="w-5 h-5" />
                  {formatCurrency(comparison_columns.controlled_cost_low_risk.hidden_costs)}
                </span>
              </div>
              
              <div className={cn('flex justify-between items-baseline pt-4 border-t-2', theme.border)}>
                <span className={cn('text-base font-bold', theme.text)}>
                  TOTAL REAL 12 meses
                </span>
                <span className={cn('text-2xl font-bold', theme.accent.replace('bg-', 'text-'))}>
                  {formatCurrency(comparison_columns.controlled_cost_low_risk.total_real)}
                </span>
              </div>
            </div>
            
            <div className={cn('mt-6 p-4 rounded', theme.accent, 'bg-opacity-10')}>
              <p className={cn('text-xs', theme.text)}>
                ✓ Todo incluido: supervisión, reportes, cumplimiento, tecnología, contingencias
              </p>
            </div>
          </div>
        </div>
        
        {/* Difference */}
        <div className="mt-8 text-center">
          <p className={cn('text-base mb-2', theme.textMuted)}>
            Diferencia de inversión anual:
          </p>
          <p className={cn('text-3xl font-bold', theme.accent.replace('bg-', 'text-'))}>
            {formatCurrency(
              comparison_columns.controlled_cost_low_risk.total_real - 
              comparison_columns.low_cost_high_risk.total_real
            )}
          </p>
          <p className={cn('text-sm mt-2', theme.textMuted)}>
            Inversión adicional en prevención y control vs costos impredecibles
          </p>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
