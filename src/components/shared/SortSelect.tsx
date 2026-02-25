"use client";

import { ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SortOption {
  key: string;
  label: string;
}

export const DEFAULT_SORT_OPTIONS: SortOption[] = [
  { key: "newest", label: "Más reciente" },
  { key: "oldest", label: "Más antiguo" },
  { key: "az", label: "A → Z" },
  { key: "za", label: "Z → A" },
];

interface SortSelectProps {
  options?: SortOption[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export function SortSelect({
  options = DEFAULT_SORT_OPTIONS,
  active,
  onChange,
  className,
}: SortSelectProps) {
  return (
    <div className={cn("relative shrink-0", className)}>
      <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <select
        value={active}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-h-[44px] appearance-none rounded-md border border-border bg-background pl-8 pr-8 text-xs text-foreground bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:10px] bg-[right_6px_center] bg-no-repeat focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
        title="Ordenar"
      >
        {options.map((opt) => (
          <option key={opt.key} value={opt.key}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
