'use client';

/**
 * ComparisonTable - Tabla de comparación Mercado vs GARD
 * Usado en sección S25 (Comparación Competitiva)
 */

import { ComparisonRow } from '@/types/presentation';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';

interface ComparisonTableProps {
  rows: ComparisonRow[];
  className?: string;
}

export function ComparisonTable({ rows, className }: ComparisonTableProps) {
  const theme = useThemeClasses();
  
  const renderValue = (value: string | boolean) => {
    if (typeof value === 'boolean') {
      return value ? (
        <Check className="w-5 h-5 text-green-500 mx-auto" />
      ) : (
        <X className="w-5 h-5 text-red-500 mx-auto" />
      );
    }
    return value;
  };
  
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse">
        <thead>
          <tr className={cn(theme.secondary)}>
            <th className={cn(
              'px-6 py-4 text-left font-semibold',
              theme.text
            )}>
              Criterio
            </th>
            <th className={cn(
              'px-6 py-4 text-center font-semibold',
              theme.textMuted
            )}>
              Mercado
            </th>
            <th className={cn(
              'px-6 py-4 text-center font-semibold',
              theme.accent.replace('bg-', 'text-')
            )}>
              GARD
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={index}
              className={cn(
                'border-t transition-colors hover:bg-opacity-50',
                theme.border,
                row.highlight ? theme.secondary : 'bg-transparent'
              )}
            >
              <td className={cn(
                'px-6 py-4 font-medium',
                theme.text
              )}>
                {row.criterion}
              </td>
              <td className={cn(
                'px-6 py-4 text-center',
                theme.textMuted
              )}>
                {renderValue(row.market)}
              </td>
              <td className={cn(
                'px-6 py-4 text-center font-semibold',
                theme.text
              )}>
                {renderValue(row.gard)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Versión mobile-friendly con cards
 */
export function ComparisonCards({ rows, className }: ComparisonTableProps) {
  const theme = useThemeClasses();
  
  return (
    <div className={cn('space-y-4 md:hidden', className)}>
      {rows.map((row, index) => (
        <div
          key={index}
          className={cn(
            'rounded-lg border p-4',
            theme.border,
            theme.secondary
          )}
        >
          <div className={cn('font-semibold mb-3', theme.text)}>
            {row.criterion}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className={cn('text-sm mb-1', theme.textMuted)}>
                Mercado
              </div>
              <div className={theme.text}>
                {typeof row.market === 'boolean' ? (
                  row.market ? '✓' : '✗'
                ) : (
                  row.market
                )}
              </div>
            </div>
            <div>
              <div className={cn('text-sm mb-1', theme.accent.replace('bg-', 'text-'))}>
                GARD
              </div>
              <div className={cn('font-semibold', theme.text)}>
                {typeof row.gard === 'boolean' ? (
                  row.gard ? '✓' : '✗'
                ) : (
                  row.gard
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
