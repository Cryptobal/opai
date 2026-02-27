"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface FilterOption {
  key: string;
  label: string;
  count?: number;
  icon?: LucideIcon;
}

function formatOptionLabel(opt: FilterOption): string {
  return opt.count !== undefined ? `${opt.label} (${opt.count})` : opt.label;
}

interface FilterPillsProps {
  options: FilterOption[];
  active: string;
  onChange: (key: string) => void;
}

export function FilterPills({ options, active, onChange }: FilterPillsProps) {
  return (
    <>
      {/* Móvil: Select compacto para evitar truncamiento */}
      <div className="md:hidden w-full min-w-[140px] max-w-[180px] shrink-0">
        <Select value={active} onValueChange={onChange}>
          <SelectTrigger className="h-8 text-xs border-border bg-background">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent align="start">
            {options.map((opt) => (
              <SelectItem key={opt.key} value={opt.key} className="text-xs">
                {formatOptionLabel(opt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop: Pills horizontales (flex-wrap, no horizontal scroll) */}
      <div className="hidden md:flex gap-1.5 flex-wrap shrink-0">
        {options.map((opt) => {
          const Icon = opt.icon;
          const isActive = active === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange(opt.key)}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors shrink-0 border",
                isActive
                  ? "bg-primary/15 text-primary border-primary/30"
                  : "text-muted-foreground hover:text-foreground border-transparent"
              )}
            >
              <span className="flex items-center gap-1">
                {Icon && <Icon className="h-3 w-3" />}
                {opt.label}
                {opt.count !== undefined && ` (${opt.count})`}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
