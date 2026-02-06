'use client';

/**
 * Section05FallasModelo - Fallas del modelo tradicional
 * Tabla causa → consecuencia → impacto
 */

import { Section05_FallasModelo } from '@/types/presentation';
import { SectionWrapper, ContainerWrapper } from '../SectionWrapper';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { AlertTriangle, ArrowRight } from 'lucide-react';

interface Section05FallasModeloProps {
  data: Section05_FallasModelo;
}

export function Section05FallasModelo({ data }: Section05FallasModeloProps) {
  const theme = useThemeClasses();
  
  return (
    <SectionWrapper id="s05-fallas-modelo">
      <ContainerWrapper size="xl">
        {/* Header */}
        <div className="text-center mb-12">
          <AlertTriangle className="w-16 h-16 mx-auto mb-6 text-red-500" />
          
          <h2 className={cn('text-3xl md:text-5xl font-bold mb-4', theme.text, theme.headlineWeight)}>
            Fallas del modelo tradicional
          </h2>
          
          <p className={cn('text-lg md:text-xl max-w-3xl mx-auto', theme.textMuted)}>
            Cómo características "normales" del mercado generan costos ocultos
          </p>
        </div>
        
        {/* Table (desktop) */}
        <div className="hidden md:block overflow-x-auto max-w-6xl mx-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className={cn(theme.secondary)}>
                <th className={cn('px-6 py-4 text-left font-semibold', theme.text)}>
                  Característica
                </th>
                <th className={cn('px-6 py-4 text-left font-semibold', theme.text)}>
                  Consecuencia Operativa
                </th>
                <th className={cn('px-6 py-4 text-left font-semibold text-red-500')}>
                  Impacto Financiero
                </th>
              </tr>
            </thead>
            <tbody>
              {data.table_rows.map((row, index) => (
                <tr key={index} className={cn('border-t', theme.border)}>
                  <td className={cn('px-6 py-4', theme.text)}>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <span className="font-medium">{row.characteristic}</span>
                    </div>
                  </td>
                  <td className={cn('px-6 py-4', theme.textMuted)}>
                    {row.operational_consequence}
                  </td>
                  <td className={cn('px-6 py-4 font-semibold text-red-500')}>
                    {row.financial_impact}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Cards (mobile) */}
        <div className="md:hidden space-y-4">
          {data.table_rows.map((row, index) => (
            <div key={index} className={cn('p-6 rounded-lg border border-red-500/30', 'bg-red-900/5')}>
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <h4 className={cn('font-bold', theme.text)}>
                  {row.characteristic}
                </h4>
              </div>
              
              <div className="space-y-2 text-sm">
                <div>
                  <span className={cn('font-semibold', theme.textMuted)}>Consecuencia: </span>
                  <span className={theme.textMuted}>{row.operational_consequence}</span>
                </div>
                <div>
                  <span className="font-semibold text-red-500">Impacto: </span>
                  <span className="text-red-500">{row.financial_impact}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Bottom message */}
        <div className="mt-12 text-center max-w-3xl mx-auto">
          <p className={cn('text-lg', theme.text)}>
            Estos no son problemas raros. Son <span className="font-bold">características estándar</span> del 
            mercado que normalizamos como "así es esto".
          </p>
        </div>
      </ContainerWrapper>
    </SectionWrapper>
  );
}
