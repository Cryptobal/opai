"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FilterPills, type FilterOption } from "./FilterPills";
import { SortSelect, type SortOption, DEFAULT_SORT_OPTIONS } from "./SortSelect";
import { ViewToggle, type ViewMode } from "./ViewToggle";

interface ListToolbarProps {
  /* ── Search ── */
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;

  /* ── Filters (pills) ── */
  filters?: FilterOption[];
  activeFilter?: string;
  onFilterChange?: (key: string) => void;

  /* ── Sort ── */
  sortOptions?: SortOption[];
  activeSort?: string;
  onSortChange?: (key: string) => void;

  /* ── View toggle ── */
  viewModes?: ViewMode[];
  activeView?: ViewMode;
  onViewChange?: (view: ViewMode) => void;

  /* ── Action button (right side) ── */
  actionSlot?: React.ReactNode;
}

export function ListToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Buscar...",
  filters,
  activeFilter,
  onFilterChange,
  sortOptions = DEFAULT_SORT_OPTIONS,
  activeSort = "newest",
  onSortChange,
  viewModes,
  activeView,
  onViewChange,
  actionSlot,
}: ListToolbarProps) {
  const hasFilters = !!(filters && filters.length > 0 && activeFilter !== undefined && onFilterChange);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
      {/* Search */}
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9 h-10 sm:h-9 bg-background text-foreground border-input"
        />
      </div>

      {/* Filtros en su propia fila en móvil para mostrar los conteos a primera vista */}
      {hasFilters && (
        <div className="-mx-1 px-1 w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:hidden">
          <FilterPills
            options={filters!}
            active={activeFilter!}
            onChange={onFilterChange!}
          />
        </div>
      )}

      {/* Controls group */}
      <div className="flex flex-wrap items-center gap-2 shrink-0 min-w-0">
        {/* Filter pills (sólo desktop; en móvil van en fila propia arriba) */}
        {hasFilters && (
          <div className="hidden sm:block">
            <FilterPills
              options={filters!}
              active={activeFilter!}
              onChange={onFilterChange!}
            />
          </div>
        )}

        {/* Sort */}
        {onSortChange && (
          <SortSelect
            options={sortOptions}
            active={activeSort}
            onChange={onSortChange}
          />
        )}

        {/* View toggle */}
        {viewModes && viewModes.length > 0 && activeView && onViewChange && (
          <ViewToggle
            modes={viewModes}
            view={activeView}
            onChange={onViewChange}
          />
        )}

        {/* Action slot */}
        {actionSlot && <div className="ml-auto sm:ml-0">{actionSlot}</div>}
      </div>
    </div>
  );
}
