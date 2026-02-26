import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { EmptyState } from './EmptyState';
import { LoadingState } from './LoadingState';

export interface DataTableColumn {
  key: string;
  label: string;
  className?: string;
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
  className?: string;
}

/**
 * DataTable - Tabla estandarizada reutilizable
 *
 * Reemplaza las implementaciones inline de <table> con clases inconsistentes.
 * Soporta modo compact para tablas dentro de cards/secciones pequeñas.
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
  className,
}: DataTableProps) {
  if (loading) {
    return <LoadingState type="skeleton" rows={5} className={className} />;
  }

  if (data.length === 0) {
    return <EmptyState title={emptyMessage} compact className={className} />;
  }

  const headerCellClasses = compact
    ? 'px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50 border-b-2 border-border'
    : 'px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50 border-b-2 border-border';

  const dataCellClasses = compact
    ? 'px-3 py-2 text-sm text-foreground border-b border-border/50'
    : 'px-4 py-2.5 text-sm text-foreground border-b border-border/50';

  return (
    <div className={cn('overflow-x-auto rounded-lg border border-border', className)}>
      <table className="w-full">
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
                'hover:bg-muted/30 transition-colors',
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
  );
}
