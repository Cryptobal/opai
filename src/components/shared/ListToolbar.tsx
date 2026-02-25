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

      {/* Controls group */}
      <div className="flex flex-wrap items-center gap-2 shrink-0 min-w-0">
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
