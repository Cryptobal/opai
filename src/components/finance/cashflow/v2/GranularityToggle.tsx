"use client";

import { cn } from "@/lib/utils";
import { Spinner } from "@/components/opai-ds";

export type Granularity = "weekly" | "monthly";

interface Props {
  value: Granularity;
  onChange: (g: Granularity) => void;
  /** Cargando la proyección mensual (primer switch). */
  loading?: boolean;
}

const OPTS: { id: Granularity; label: string }[] = [
  { id: "weekly", label: "Semanal" },
  { id: "monthly", label: "Mensual" },
];

/** Switch Semanal/Mensual. La carga de la proyección mensual la dispara el
 *  shell (donde vive el estado y el cache); este componente solo refleja. */
export function GranularityToggle({ value, onChange, loading }: Props) {
  return (
    <div className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-ds-border-default bg-ds-surface-1 p-0.5">
      {OPTS.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            disabled={loading}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-primary/15 text-primary"
                : "text-ds-text-3 hover:text-ds-text-1",
            )}
          >
            {loading && active && <Spinner size="sm" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
