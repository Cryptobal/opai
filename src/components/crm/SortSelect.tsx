"use client";

import { ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SimpleSelect } from "@/components/ui/simple-select";

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
      <ArrowUpDown className="absolute left-2.5 top-1/2 z-10 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <SimpleSelect
        value={active}
        onValueChange={onChange}
        title="Ordenar"
        aria-label="Ordenar"
        className="h-9 min-h-[44px] w-auto pl-8 pr-7 text-xs"
        options={options.map((opt) => ({ value: opt.key, label: opt.label }))}
      />
    </div>
  );
}
