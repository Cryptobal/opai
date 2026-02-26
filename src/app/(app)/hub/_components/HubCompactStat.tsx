import { cn } from '@/lib/utils';
import type { CompactStatProps } from '../_lib/hub-types';

/**
 * Intencional: componente compacto específico del Hub, no usa KpiCard
 * porque requiere densidad mayor (p-3) y diseño con barra de color.
 */
export function HubCompactStat({ label, value, className }: CompactStatProps & { className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/30", className)}>
      <div className="h-1 w-8 rounded-full bg-primary/40 mb-2" />
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
