import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FilterBarProps {
  /** Controles de filtro (selects, inputs, botones) */
  children: ReactNode;
  className?: string;
}

/**
 * FilterBar - Contenedor estandarizado para filtros
 *
 * Reemplaza los contenedores con padding asimétrico (px-4 pb-4 pt-0)
 * por un layout uniforme con p-3.
 *
 * @example
 * ```tsx
 * <FilterBar>
 *   <Select value={status} onValueChange={setStatus}>...</Select>
 *   <Input placeholder="Buscar..." value={search} onChange={...} />
 *   <Button variant="outline" size="sm">Limpiar</Button>
 * </FilterBar>
 * ```
 */
export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50',
        className
      )}
    >
      {children}
    </div>
  );
}
