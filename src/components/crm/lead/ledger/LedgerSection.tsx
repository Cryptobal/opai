"use client";

import { cn } from "@/lib/utils";

/**
 * LedgerSection — contenedor del "conversion ledger". Dibuja el riel vertical
 * continuo (línea a la izquierda) sobre el que cuelgan los LedgerRow.
 */
export interface LedgerSectionProps {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function LedgerSection({ title, hint, children, className }: LedgerSectionProps) {
  return (
    <section className={cn("rounded-2xl border border-ds-border-subtle bg-card", className)}>
      <header className="flex items-baseline justify-between gap-2 px-4 pt-3.5 pb-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-3">
          {title}
        </h3>
        {hint && <span className="text-xs text-ds-text-3">{hint}</span>}
      </header>
      <div className="relative px-4 pb-2">
        {/* Riel vertical: 2px, a la altura de los nodos de cada fila */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 bottom-4 w-0.5 bg-ds-border-default"
          style={{ left: 25 }}
        />
        {children}
      </div>
    </section>
  );
}
