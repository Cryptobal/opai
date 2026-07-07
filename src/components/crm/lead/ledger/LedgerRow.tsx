"use client";

import { useState } from "react";
import { ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LedgerRow — fila individual del ledger, colgada del riel vertical de
 * LedgerSection. Colapsable; el nodo del riel se rellena de verde cuando el
 * registro quedará creado al aprobar.
 */
export interface LedgerRowProps {
  id: string;
  type: string;
  name: string;
  meta?: React.ReactNode;
  flag?: { label: string; tone: "warn" | "ok" | "info" };
  created?: boolean;
  defaultOpen?: boolean;
  children?: React.ReactNode;
  className?: string;
}

const FLAG_TONES: Record<"warn" | "ok" | "info", string> = {
  warn: "border-status-warn-border bg-status-warn-soft text-status-warn-fg",
  ok: "border-status-ok-border bg-status-ok-soft text-status-ok-fg",
  info: "border-status-info-border bg-status-info-soft text-status-info-fg",
};

export function LedgerRow({
  id,
  type,
  name,
  meta,
  flag,
  created,
  defaultOpen,
  children,
  className,
}: LedgerRowProps) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const hasBody = Boolean(children);

  return (
    <div className={cn("relative pl-8", className)} data-open={open}>
      {/* Nodo del riel */}
      <span
        aria-hidden
        className={cn(
          "absolute left-[9px] top-[18px] flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors motion-reduce:transition-none",
          created ? "border-primary bg-primary" : "border-ds-border-strong bg-card",
        )}
      >
        <Check
          className={cn(
            "h-2.5 w-2.5 text-primary-foreground transition-opacity motion-reduce:transition-none",
            created ? "opacity-100" : "opacity-0",
          )}
        />
      </span>

      <button
        type="button"
        onClick={() => hasBody && setOpen((v) => !v)}
        aria-expanded={hasBody ? open : undefined}
        aria-controls={hasBody ? `${id}-body` : undefined}
        disabled={!hasBody}
        className={cn(
          "flex min-h-14 w-full items-center gap-2.5 border-b border-ds-border-subtle py-2 text-left",
          hasBody && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-3">
            {type}
          </span>
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{name}</span>
            {flag && (
              <span
                className={cn(
                  "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]",
                  FLAG_TONES[flag.tone],
                )}
              >
                {flag.label}
              </span>
            )}
          </span>
          {meta && <span className="mt-0.5 block truncate text-xs text-ds-text-3">{meta}</span>}
        </span>
        {hasBody && (
          <ChevronRight
            aria-hidden
            className={cn(
              "h-4 w-4 shrink-0 text-ds-text-3 transition-transform motion-reduce:transition-none",
              open && "rotate-90",
            )}
          />
        )}
      </button>

      {hasBody && (
        <div id={`${id}-body`} hidden={!open} className="pb-3 pt-2">
          {children}
        </div>
      )}
    </div>
  );
}
