"use client";

import { Check } from "lucide-react";

/**
 * Grupo de opciones single-select (lista con check) compartido por el popover
 * de filtros desktop y el sheet de filtros móvil.
 */
export function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="px-2 text-[12px] font-medium text-ds-text-4">{label}</p>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className="flex h-11 w-full items-center justify-between rounded-lg px-2.5 text-left text-ds-body text-ds-text-2 hover:bg-ds-surface-3 ds-tap sm:h-9"
        >
          {option.label}
          {value === option.id && <Check className="h-4 w-4 text-primary" />}
        </button>
      ))}
    </div>
  );
}
