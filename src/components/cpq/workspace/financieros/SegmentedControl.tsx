"use client";

import { cn } from "@/lib/utils";

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex w-full rounded-md border border-ds-border-default bg-ds-surface-2 p-0.5"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "min-h-11 flex-1 rounded px-2 text-[12px] font-medium transition-colors sm:min-h-9",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-ds-text-3 hover:text-ds-text-2",
              disabled && "opacity-60",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
