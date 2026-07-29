"use client";

import type { ModuleSearchOperator } from "@/components/opai-ds";

type Props = {
  operators: ModuleSearchOperator[];
  onInsert: (token: string) => void;
};

/** Fila de chips de operadores del overlay de búsqueda de módulo. */
export function ModuleSearchOperators({ operators, onInsert }: Props) {
  if (operators.length === 0) return null;
  return (
    <div className="mt-2 flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-none">
      <span className="shrink-0 text-[12px] text-ds-text-4">Operadores</span>
      {operators.map((op) => (
        <button
          key={op.token}
          type="button"
          title={op.hint}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(op.token)}
          className="inline-flex h-8 shrink-0 items-center rounded-full border border-ds-border-subtle bg-ds-surface-2 px-2 font-mono text-[12px] text-ds-text-3 ds-tap hover:text-ds-text-1"
        >
          {op.token}
        </button>
      ))}
    </div>
  );
}
