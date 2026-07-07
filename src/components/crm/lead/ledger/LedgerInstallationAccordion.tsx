"use client";

import { useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LedgerInstallationAccordion — sección colapsable dentro del body de la fila
 * Instalación. Genérico y presentacional.
 */
export interface LedgerInstallationAccordionProps {
  icon: LucideIcon;
  iconColorClass: string;
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function LedgerInstallationAccordion({
  icon: Icon,
  iconColorClass,
  title,
  summary,
  defaultOpen,
  children,
}: LedgerInstallationAccordionProps) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="mb-2 rounded-xl border border-ds-border-subtle bg-background">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ds-surface-3", iconColorClass)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          {!open && summary && <span className="block truncate text-xs text-ds-text-3">{summary}</span>}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "h-4 w-4 shrink-0 text-ds-text-3 transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="border-t border-dashed border-ds-border-subtle px-3.5 py-3">{children}</div>
      )}
    </div>
  );
}
