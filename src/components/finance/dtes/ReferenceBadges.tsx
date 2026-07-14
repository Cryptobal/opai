"use client";

import { Link2 } from "lucide-react";
import { Tag } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import { refTypeLabel, type DteAdditionalRef } from "./shared/references";

interface Props {
  refs?: DteAdditionalRef[] | null;
  className?: string;
  /** Límite de badges visibles antes de colapsar en "+N". */
  max?: number;
  /**
   * - "column" (desktop): stack vertical de dos filas (tipo / folio),
   *   centrado. Lee el folio completo en una columna angosta sin truncar.
   * - "row" (mobile): fila horizontal que envuelve, cada ref inline
   *   (badge + folio), alineada al inicio.
   */
  variant?: "column" | "row";
}

/**
 * Renderiza las referencias adicionales (OC, HES, Contrato...) de un DTE.
 * Muestra "—" cuando el DTE no declara ninguna.
 */
export function ReferenceBadges({
  refs,
  className,
  max = 3,
  variant = "column",
}: Props) {
  const isColumn = variant === "column";
  if (!refs || refs.length === 0) {
    return (
      <span
        className={cn(
          "block text-xs text-ds-text-4",
          isColumn && "text-center",
        )}
      >
        —
      </span>
    );
  }
  const visible = refs.slice(0, max);
  const hidden = refs.length - visible.length;
  return (
    <div
      className={cn(
        "flex min-w-0 max-w-full",
        isColumn
          ? "flex-col items-center gap-1.5"
          : "flex-row flex-wrap items-center gap-x-3 gap-y-1",
        className,
      )}
    >
      {visible.map((r, i) => {
        const label = refTypeLabel(r.tipoDocRef);
        const tooltip = [
          label,
          r.folioRef && `#${r.folioRef}`,
          r.fchRef,
          r.razonRef,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <div
            key={i}
            title={tooltip}
            className={cn(
              "flex min-w-0 max-w-full",
              isColumn
                ? "flex-col items-center gap-0.5 leading-none"
                : "flex-row items-center gap-1.5",
            )}
          >
            <Tag variant="neutral" size="sm" icon={Link2}>
              {label}
            </Tag>
            {r.folioRef ? (
              <span
                className={cn(
                  "font-mono tabular-nums text-xs text-ds-text-3 max-w-full truncate",
                  isColumn && "text-center",
                )}
              >
                {r.folioRef}
              </span>
            ) : null}
          </div>
        );
      })}
      {hidden > 0 ? (
        <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
          +{hidden} más
        </span>
      ) : null}
    </div>
  );
}
