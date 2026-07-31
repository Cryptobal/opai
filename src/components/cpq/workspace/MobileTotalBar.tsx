"use client";

/**
 * Fila 1 del stack sticky móvil CPQ (~46px): estado · total · acciones.
 * El chip UF del día vive en la línea secundaria (no como pill aparte).
 */

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const formatCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

export function MobileTotalBar({
  totalClp,
  currency,
  ufValue,
  saving = false,
  statusSlot,
  actionsSlot,
  className,
}: {
  /** Total mensual cliente en CLP (fuente interna del CPQ). */
  totalClp: number;
  currency: string;
  ufValue: number | null;
  saving?: boolean;
  /** Badge de estado (izq.). */
  statusSlot?: ReactNode;
  /** Botón ⋮ u otras acciones (der.). */
  actionsSlot?: ReactNode;
  className?: string;
}) {
  const hasUf = ufValue != null && Number.isFinite(ufValue) && ufValue > 0;
  const totalUf = hasUf ? totalClp / (ufValue as number) : null;
  const isUf = (currency || "CLP").toUpperCase() === "UF";

  const primary = isUf && totalUf != null
    ? `${totalUf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`
    : formatCLP(totalClp);

  const secondaryParts: string[] = [];
  if (isUf) {
    secondaryParts.push(formatCLP(totalClp));
  } else if (totalUf != null) {
    secondaryParts.push(
      `${totalUf.toLocaleString("es-CL", { maximumFractionDigits: 2 })} UF`,
    );
  }
  if (hasUf) {
    secondaryParts.push(`UF ${formatCLP(ufValue as number)}`);
  }
  const secondary = secondaryParts.join(" · ");

  return (
    <div className={cn("flex h-[46px] items-center gap-2 px-3", className)}>
      {statusSlot ? <div className="shrink-0">{statusSlot}</div> : null}
      <div className="flex min-w-0 flex-1 flex-col items-end justify-center leading-tight">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-mono text-[17px] font-extrabold tabular-nums text-status-ok-fg">
            {primary}
          </span>
          {saving && (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          )}
        </div>
        {secondary ? (
          <span className="max-w-full truncate text-[11px] font-mono uppercase tracking-[0.08em] tabular-nums text-muted-foreground">
            {secondary}
          </span>
        ) : null}
      </div>
      {actionsSlot ? <div className="shrink-0">{actionsSlot}</div> : null}
    </div>
  );
}
