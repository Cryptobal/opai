"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

type Props = {
  title: string;
  /** Contador que se muestra junto al título (ej. 4 → "Supuestos (4)"). */
  count?: number;
  /** Línea fija que explica qué hace la sección al expandirla. */
  purpose?: string;
  defaultOpen?: boolean;
  tone?: "surface-1" | "surface-2";
  children: React.ReactNode;
};

/**
 * Sección colapsable compacta del Plan de acciones. Mismo patrón que
 * CoverageStageGroup (botón + chevron), sin dependencias nuevas.
 */
export function PlanCollapsibleSection({
  title,
  count,
  purpose,
  defaultOpen = false,
  tone = "surface-2",
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const bg = tone === "surface-1" ? "bg-ds-surface-1" : "bg-ds-surface-2";

  return (
    <section className={`overflow-hidden rounded-xl border border-ds-border-subtle ${bg}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-11 w-full items-center gap-2 px-3 text-left ds-tap sm:h-10"
      >
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
          {title}
          {count != null ? ` (${count})` : ""}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-ds-text-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-2.5">
          {purpose && <p className="text-[12px] text-ds-text-4">{purpose}</p>}
          {children}
        </div>
      )}
    </section>
  );
}
