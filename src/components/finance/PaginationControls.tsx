"use client";

/**
 * PaginationControls — control compartido para tablas/listas paginadas
 * del módulo Finanzas (DTE Emitidos, Recibidos, etc).
 *
 * Muestra:
 *   - Selector de tamaño de página (10/25/50/100/200)
 *   - Botones primera / anterior / siguiente / última
 *   - Texto "Mostrando X-Y de Z"
 *
 * Mobile-first: en pantallas chicas se apila verticalmente.
 */

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";

export interface PaginationControlsProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  loading?: boolean;
  /** Opciones de pageSize. Default: [10, 25, 50, 100, 200]. */
  pageSizeOptions?: number[];
}

const DEFAULT_OPTIONS = [10, 25, 50, 100, 200];

export function PaginationControls({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  loading = false,
  pageSizeOptions = DEFAULT_OPTIONS,
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);

  const isFirst = safePage <= 1;
  const isLast = safePage >= totalPages;

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 py-3 border-t border-border">
      {/* Texto + selector de pageSize */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          {total === 0
            ? "Sin resultados"
            : `Mostrando ${from.toLocaleString("es-CL")}–${to.toLocaleString("es-CL")} de ${total.toLocaleString("es-CL")}`}
        </span>
        <div className="flex items-center gap-1.5">
          <span>Por página:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(parseInt(v, 10))}
            disabled={loading}
          >
            <SelectTrigger className="h-8 w-[70px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((opt) => (
                <SelectItem key={opt} value={String(opt)}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Nav buttons */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onPageChange(1)}
          disabled={isFirst || loading}
          aria-label="Primera página"
        >
          <ChevronFirst className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onPageChange(safePage - 1)}
          disabled={isFirst || loading}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground px-2 min-w-[80px] text-center">
          Página {safePage} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onPageChange(safePage + 1)}
          disabled={isLast || loading}
          aria-label="Página siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => onPageChange(totalPages)}
          disabled={isLast || loading}
          aria-label="Última página"
        >
          <ChevronLast className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
