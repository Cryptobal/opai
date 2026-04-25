"use client";

import { Search, CheckSquare, Square } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FilterPills, type FilterOption } from "@/components/shared/FilterPills";
import { SortSelect, type SortOption, DEFAULT_SORT_OPTIONS } from "@/components/shared/SortSelect";
import { ViewToggle, type ViewMode } from "@/components/shared/ViewToggle";

interface SelectAllConfig {
  checked: boolean;
  onToggle: () => void;
  show: boolean;
}

interface CrmToolbarProps {
  /* ── Search ── */
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;

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

  /* ── Select all ── */
  selectAll?: SelectAllConfig;

  /* ── Action button (right side) ── */
  actionSlot?: React.ReactNode;
}

export function CrmToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  filters,
  activeFilter,
  onFilterChange,
  sortOptions = DEFAULT_SORT_OPTIONS,
  activeSort = "newest",
  onSortChange,
  viewModes,
  activeView,
  onViewChange,
  selectAll,
  actionSlot,
}: CrmToolbarProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
      {/* Search */}
      <div className="relative w-full min-w-0 sm:min-w-[280px] sm:flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9 h-10 sm:h-9 bg-background text-foreground border-input"
        />
      </div>

      {/* Controls group: mobile-first, sin apretar filtros ni perder el CTA. */}
      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 min-w-0 sm:flex sm:w-auto sm:flex-wrap">
        {/* Select all */}
        {selectAll?.show && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1.5 text-xs"
            onClick={selectAll.onToggle}
          >
            {selectAll.checked ? (
              <CheckSquare className="h-4 w-4 text-primary" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {selectAll.checked ? "Deseleccionar" : "Seleccionar todos"}
            </span>
          </Button>
        )}

        {/* Filter pills */}
        {filters && filters.length > 0 && activeFilter !== undefined && onFilterChange && (
          <FilterPills
            options={filters}
            active={activeFilter}
            onChange={onFilterChange}
          />
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
        {actionSlot}
      </div>
    </div>
  );
}
