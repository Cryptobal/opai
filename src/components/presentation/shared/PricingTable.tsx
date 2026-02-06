'use client';

/**
 * PricingTable - Tabla de propuesta económica
 * Usado en sección S23 (Propuesta Económica)
 */

import { PricingData } from '@/types/presentation';
import { useThemeClasses } from '../ThemeProvider';
import { cn } from '@/lib/utils';
import { formatCurrency, formatUF } from '@/lib/utils';

interface PricingTableProps {
  pricing: PricingData;
  className?: string;
}

export function PricingTable({ pricing, className }: PricingTableProps) {
  const theme = useThemeClasses();
  
  const formatPrice = (value: number) => {
    return pricing.currency === 'UF' ? formatUF(value) : formatCurrency(value);
  };
  
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse">
        <thead>
          <tr className={cn(theme.secondary)}>
            <th className={cn('px-6 py-4 text-left font-semibold', theme.text)}>
              Descripción
            </th>
            <th className={cn('px-6 py-4 text-center font-semibold', theme.text)}>
              Cantidad
            </th>
            <th className={cn('px-6 py-4 text-right font-semibold', theme.text)}>
              Precio Unitario
            </th>
            <th className={cn('px-6 py-4 text-right font-semibold', theme.text)}>
              Subtotal
            </th>
          </tr>
        </thead>
        <tbody>
          {pricing.items.map((item, index) => (
            <tr
              key={index}
              className={cn(
                'border-t',
                theme.border
              )}
            >
              <td className={cn('px-6 py-4', theme.text)}>
                <div className="font-medium">{item.description}</div>
                {item.notes && (
                  <div className={cn('text-sm mt-1', theme.textMuted)}>
                    {item.notes}
                  </div>
                )}
              </td>
              <td className={cn('px-6 py-4 text-center', theme.text)}>
                {item.quantity}
              </td>
              <td className={cn('px-6 py-4 text-right', theme.textMuted)}>
                {formatPrice(item.unit_price)}
              </td>
              <td className={cn('px-6 py-4 text-right font-semibold', theme.text)}>
                {formatPrice(item.subtotal)}
              </td>
            </tr>
          ))}
          
          {/* Subtotal */}
          <tr className={cn('border-t', theme.border)}>
            <td colSpan={3} className={cn('px-6 py-4 text-right font-semibold', theme.text)}>
              Subtotal
            </td>
            <td className={cn('px-6 py-4 text-right font-semibold', theme.text)}>
              {formatPrice(pricing.subtotal)}
            </td>
          </tr>
          
          {/* IVA */}
          <tr>
            <td colSpan={3} className={cn('px-6 py-4 text-right font-semibold', theme.text)}>
              IVA (19%)
            </td>
            <td className={cn('px-6 py-4 text-right font-semibold', theme.text)}>
              {formatPrice(pricing.tax)}
            </td>
          </tr>
          
          {/* Total */}
          <tr className={cn('border-t-2', theme.border, theme.secondary)}>
            <td colSpan={3} className={cn('px-6 py-4 text-right text-xl font-bold', theme.text)}>
              TOTAL
            </td>
            <td className={cn(
              'px-6 py-4 text-right text-2xl font-bold',
              theme.accent.replace('bg-', 'text-')
            )}>
              {formatPrice(pricing.total)}
            </td>
          </tr>
        </tbody>
      </table>
      
      {/* Notas adicionales */}
      {pricing.notes && pricing.notes.length > 0 && (
        <div className={cn('mt-6 space-y-2', theme.textMuted)}>
          {pricing.notes.map((note, index) => (
            <div key={index} className="text-sm flex items-start gap-2">
              <span>•</span>
              <span>{note}</span>
            </div>
          ))}
        </div>
      )}
      
      {/* Términos de pago */}
      {pricing.payment_terms && (
        <div className={cn('mt-4 p-4 rounded-lg', theme.secondary)}>
          <div className={cn('text-sm font-semibold mb-1', theme.text)}>
            Forma de Pago
          </div>
          <div className={cn('text-sm', theme.textMuted)}>
            {pricing.payment_terms}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Versión mobile-friendly con cards
 */
export function PricingCards({ pricing, className }: PricingTableProps) {
  const theme = useThemeClasses();
  
  const formatPrice = (value: number) => {
    return pricing.currency === 'UF' ? formatUF(value) : formatCurrency(value);
  };
  
  return (
    <div className={cn('space-y-4 md:hidden', className)}>
      {pricing.items.map((item, index) => (
        <div
          key={index}
          className={cn('rounded-lg border p-4', theme.border, theme.secondary)}
        >
          <div className={cn('font-semibold mb-2', theme.text)}>
            {item.description}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className={theme.textMuted}>Cantidad:</span>
              <span className={cn('ml-2 font-medium', theme.text)}>
                {item.quantity}
              </span>
            </div>
            <div>
              <span className={theme.textMuted}>P. Unitario:</span>
              <span className={cn('ml-2 font-medium', theme.text)}>
                {formatPrice(item.unit_price)}
              </span>
            </div>
          </div>
          <div className={cn('mt-2 pt-2 border-t text-right font-bold', theme.border, theme.text)}>
            {formatPrice(item.subtotal)}
          </div>
          {item.notes && (
            <div className={cn('mt-2 text-xs', theme.textMuted)}>
              {item.notes}
            </div>
          )}
        </div>
      ))}
      
      {/* Total */}
      <div className={cn('rounded-lg border p-4', theme.border, theme.accent)}>
        <div className="flex justify-between items-center">
          <span className="text-xl font-bold text-white">TOTAL</span>
          <span className="text-2xl font-bold text-white">
            {formatPrice(pricing.total)}
          </span>
        </div>
      </div>
    </div>
  );
}
