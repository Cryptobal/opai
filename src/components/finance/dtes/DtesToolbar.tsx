"use client";

import { Search, SlidersHorizontal, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DTE_SORT_OPTIONS } from "./shared/constants";
import type { DteFilters, DteSortKey } from "./shared/types";

interface Props {
  filters: DteFilters;
  update: <K extends keyof DteFilters>(key: K, value: DteFilters[K]) => void;
  activeCount: number;
  onOpenFilters: () => void;
  canManage: boolean;
  /** Acción "Exportar CSV". Si se omite, el botón aparece deshabilitado. */
  onExport?: () => void;
  /** Si el botón "Exportar" está deshabilitado por contexto (ej: sin filas). */
  exportDisabled?: boolean;
}

/**
 * Toolbar compacta del listado de DTEs Emitidos.
 *
 * Layout (de izquierda a derecha):
 *   1. Search (flex-1) con icon Search a la izquierda.
 *   2. Botón "Filtros" con badge de count.
 *   3. Select de orden (oculto en mobile — se mueve al drawer).
 *   4. Botón Export icon-only deshabilitado (placeholder).
 *   5. Botón "Emitir DTE" si canManage.
 */
export function DtesToolbar({
  filters,
  update,
  activeCount,
  onOpenFilters,
  canManage,
  onExport,
  exportDisabled = false,
}: Props) {
  void canManage;
  const exportEnabled = !!onExport && !exportDisabled;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative flex-1 min-w-[220px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ds-text-4" />
        <Input
          placeholder="Buscar por folio, RUT, cliente o monto…"
          value={filters.search}
          onChange={(e) => update("search", e.target.value)}
          className="pl-10 h-10"
        />
      </div>

      {/* Botón Filtros */}
      <Button
        variant="outline"
        size="sm"
        onClick={onOpenFilters}
        className={cn(
          "h-10 gap-2",
          activeCount > 0 && "border-primary/40 text-primary",
        )}
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span className="hidden sm:inline">Filtros</span>
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-primary/15 text-primary text-[11px] font-medium px-1.5">
            {activeCount}
          </span>
        )}
      </Button>

      {/* Sort (desktop) */}
      <div className="hidden md:block">
        <Select
          value={filters.sort}
          onValueChange={(v) => update("sort", v as DteSortKey)}
        >
          <SelectTrigger className="w-48 h-10">
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            {DTE_SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Export CSV — descarga lo filtrado actualmente. */}
      <Button
        variant="outline"
        size="sm"
        onClick={onExport}
        disabled={!exportEnabled}
        title={exportEnabled ? "Exportar CSV" : "No hay datos para exportar"}
        className="hidden md:inline-flex h-10 w-10 p-0 justify-center"
        aria-label="Exportar"
      >
        <Download className="h-4 w-4" />
      </Button>
    </div>
  );
}
