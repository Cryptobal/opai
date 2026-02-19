"use client";

import { Search, CheckSquare, Square } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FilterPills, type FilterOption } from "./FilterPills";
import { SortSelect, type SortOption, DEFAULT_SORT_OPTIONS } from "./SortSelect";
import { ViewToggle, type ViewMode } from "./ViewToggle";

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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {/* Search */}
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9 h-9 bg-background text-foreground border-input"
        />
      </div>

      {/* Controls group: en móvil permite wrap para mejor distribución */}
      <div className="flex flex-wrap items-center gap-2 shrink-0 min-w-0">
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
