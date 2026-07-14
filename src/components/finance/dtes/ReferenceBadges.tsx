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
}

/**
 * Renderiza las referencias adicionales (OC, HES, Contrato...) de un DTE
 * como badges compactos "TIPO · folio". Muestra "—" cuando no hay ninguna.
 * Se usa en la columna "Referencias" (desktop) y en la card (mobile).
 */
export function ReferenceBadges({ refs, className, max = 3 }: Props) {
  if (!refs || refs.length === 0) {
    return <span className="text-ds-text-4 text-xs">—</span>;
  }
  const visible = refs.slice(0, max);
  const hidden = refs.length - visible.length;
  return (
    <div className={cn("flex flex-col gap-1 min-w-0 max-w-full", className)}>
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
          <span
            key={i}
            title={tooltip}
            className="inline-flex items-center gap-1 min-w-0 max-w-full"
          >
            <Tag variant="neutral" size="sm" icon={Link2}>
              {label}
            </Tag>
            {r.folioRef ? (
              <span className="font-mono tabular-nums text-xs text-ds-text-3 truncate">
                {r.folioRef}
              </span>
            ) : null}
          </span>
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
