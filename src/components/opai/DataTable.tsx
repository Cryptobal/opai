import { type ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/opai-ds';
import { LoadingState } from './LoadingState';

export interface DataTableColumn {
  key: string;
  label: string;
  className?: string;
  /** Hide this column in mobile card view */
  hideOnMobile?: boolean;
  render?: (value: any, row: any) => ReactNode;
}

export interface DataTableProps {
  /** Definición de columnas con key, label, render opcional */
  columns: DataTableColumn[];
  /** Array de datos a mostrar */
  data: Array<Record<string, any>>;
  /** Callback al hacer click en una fila */
  onRowClick?: (row: any) => void;
  /** Mensaje cuando no hay datos */
  emptyMessage?: string;
  /** Muestra estado de carga */
  loading?: boolean;
  /** Reduce padding para tablas dentro de secciones pequeñas */
  compact?: boolean;
  /** Show mobile card view on small screens (default: true) */
  mobileCardView?: boolean;
  className?: string;
}

/**
 * DataTable - Tabla estandarizada reutilizable
 *
 * Desktop: tabla estándar con columnas.
 * Mobile (<md): vista de cards con key-value pairs (primeras 4 columnas visibles).
 *
 * @example
 * ```tsx
 * <DataTable
 *   columns={[
 *     { key: 'name', label: 'Nombre' },
 *     { key: 'email', label: 'Email' },
 *     { key: 'status', label: 'Estado', render: (v) => <StatusBadge status={v} /> },
 *   ]}
 *   data={users}
 *   onRowClick={(row) => router.push(`/users/${row.id}`)}
 *   emptyMessage="No hay usuarios registrados"
 * />
 * ```
 */
export function DataTable({
  columns,
  data,
  onRowClick,
  emptyMessage = 'No hay datos para mostrar',
  loading = false,
  compact = false,
  mobileCardView = true,
  className,
}: DataTableProps) {
  if (loading) {
    return <LoadingState type="skeleton" rows={5} className={className} />;
  }

  if (data.length === 0) {
    return <EmptyState icon={<Inbox className="h-8 w-8" />} title={emptyMessage} compact className={className} />;
  }

  const headerCellClasses = compact
    ? 'px-3 py-2 text-left text-sm font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50 border-b-2 border-border'
    : 'px-4 py-3 text-left text-sm font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50 border-b-2 border-border';

  const dataCellClasses = compact
    ? 'px-3 py-2 text-sm sm:text-base text-foreground border-b border-border/50'
    : 'px-4 py-2.5 text-sm sm:text-base text-foreground border-b border-border/50';

  // For mobile card view, show first 4 non-hidden columns
  const mobileColumns = columns.filter((c) => !c.hideOnMobile).slice(0, 4);

  return (
    <div className={cn(className)}>
      {/* Mobile card view */}
      {mobileCardView && (
        <div className="md:hidden space-y-2">
          {data.map((row, rowIndex) => (
            <div
              key={row.id ?? rowIndex}
              className={cn(
                'rounded-lg border border-border bg-card p-3 space-y-1.5 transition-colors active:bg-muted/50',
                onRowClick && 'cursor-pointer'
              )}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {mobileColumns.map((col, colIdx) => {
                const value = col.render ? col.render(row[col.key], row) : row[col.key];
                // First column is the "title" — render larger
                if (colIdx === 0) {
                  return (
                    <div key={col.key} className="text-base font-medium text-foreground truncate min-w-0">
                      {value}
                    </div>
                  );
                }
                return (
                  <div key={col.key} className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-sm text-muted-foreground shrink-0">{col.label}</span>
                    <span className="text-sm text-foreground truncate min-w-0 text-right">{value}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Desktop table view */}
      <div className={cn('overflow-x-auto rounded-lg border border-border', mobileCardView && 'hidden md:block')}>
        <table className="w-full min-w-0">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={cn(headerCellClasses, col.className)}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr
                key={row.id ?? rowIndex}
                className={cn(
                  'hover:bg-muted/30 active:bg-muted/50 transition-colors',
                  onRowClick && 'cursor-pointer'
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn(dataCellClasses, col.className)}>
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
