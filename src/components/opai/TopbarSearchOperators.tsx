"use client";

import { useEffect, useRef } from "react";
import type { ModuleSearchOperator } from "@/components/opai-ds";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  operators: ModuleSearchOperator[];
  onInsert: (token: string) => void;
  /** Ancla visual (el campo); el popover se posiciona debajo. */
  className?: string;
};

/** Popover anclado con operadores insertables del módulo. */
export function TopbarSearchOperators({
  open,
  onClose,
  operators,
  onInsert,
  className,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);

  if (!open || operators.length === 0) return null;

  return (
    <div
      ref={panelRef}
      role="listbox"
      aria-label="Operadores de búsqueda"
      className={cn(
        "absolute left-0 top-full z-40 mt-1.5 w-full max-w-[360px]",
        "rounded-2xl border border-ds-border-default bg-ds-surface-2 p-2 shadow-ds-lg",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-150",
        "motion-reduce:animate-none",
        className,
      )}
    >
      <p className="px-2 pb-1.5 text-[12px] text-ds-text-4">Operadores</p>
      <div className="flex max-h-64 flex-wrap gap-1 overflow-y-auto">
        {operators.map((op) => (
          <button
            key={op.token}
            type="button"
            role="option"
            title={op.hint}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onInsert(op.token);
              onClose();
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-ds-border-subtle bg-ds-surface-1 px-2.5 font-mono text-[12px] text-ds-text-2 ds-tap hover:border-ds-border-default hover:text-ds-text-1"
          >
            {op.token}
            {op.hint ? (
              <span className="font-sans text-ds-text-4">{op.hint}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
