'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface FxData {
  value: number;
  date?: string;
  month?: string;
  monthShort?: string;
  updatedAt?: string;
}

interface IndicatorsData {
  uf: FxData | null;
  utm: FxData | null;
}

const formatCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

/**
 * GlobalIndicators - UF + UTM siempre visibles
 *
 * Se muestra en la barra superior (desktop y mobile).
 * Única fuente de verdad: no duplicar en páginas individuales.
 */
export function GlobalIndicators({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const [data, setData] = useState<IndicatorsData | null>(null);

  const fetchIndicators = useCallback(async () => {
    try {
      const res = await fetch('/api/fx/indicators', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }
    } catch (error) {
      console.error('Error fetching FX indicators:', error);
    }
  }, []);

  useEffect(() => {
    fetchIndicators();
    const interval = setInterval(fetchIndicators, 5 * 60 * 1000); // cada 5 min
    return () => clearInterval(interval);
  }, [fetchIndicators]);

  return (
    <div
      className={cn(
        'flex items-center gap-4',
        compact && 'min-w-0 gap-2',
        className
      )}
    >
      {/* UF */}
      {data?.uf && (
        <div
          className={cn(
            'shrink-0 rounded-lg border border-border bg-card px-3 py-1.5 text-center',
            compact ? 'px-2 py-1' : 'min-w-[140px]'
          )}
          title={`UF vigente ${data.uf.date || ''}`}
        >
          <p className={cn('text-xs uppercase text-muted-foreground', compact && 'text-[10px]')}>
            {compact ? 'UF' : `UF ${data.uf.date || ''}`}
          </p>
          <p className={cn('text-sm font-mono font-semibold', compact && 'text-[10px]')}>
            {formatCLP(data.uf.value)}
          </p>
        </div>
      )}

      {/* UTM - mismo formato que UF: solo etiqueta + valor (ej. "UTM enero" / "$69.611") */}
      {data?.utm && (
        <div
          className={cn(
            'shrink-0 rounded-lg border border-border bg-card px-3 py-1.5 text-center',
            compact ? 'px-2 py-1 max-[420px]:hidden' : 'min-w-[140px]'
          )}
          title={data.utm.updatedAt ? `UTM vigente ${data.utm.month || ''} (actualizado ${data.utm.updatedAt})` : `UTM ${data.utm.month || ''}`}
        >
          <p className={cn('text-xs uppercase text-muted-foreground', compact && 'text-[10px]')}>
            {compact ? 'UTM' : `UTM ${(data.utm.month || '').split(' ')[0] || data.utm.monthShort || 'UTM'}`}
          </p>
          <p className={cn('text-sm font-mono font-semibold', compact && 'text-[10px]')}>
            {formatCLP(data.utm.value)}
          </p>
        </div>
      )}
    </div>
  );
}
