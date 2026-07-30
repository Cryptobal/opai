"use client";

/**
 * Barra glass sticky móvil (40px): TOTAL MENSUAL en UF + equivalente CLP +
 * chip con el valor de la UF del día (reemplaza al indicador UF/UTM del topbar,
 * que en móvil no se muestra).
 */

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
  className,
}: {
  /** Total mensual cliente en CLP (fuente interna del CPQ). */
  totalClp: number;
  currency: string;
  ufValue: number | null;
  saving?: boolean;
  className?: string;
}) {
  const hasUf = ufValue != null && Number.isFinite(ufValue) && ufValue > 0;
  const totalUf = hasUf ? totalClp / (ufValue as number) : null;
  const isUf = (currency || "CLP").toUpperCase() === "UF";

  return (
    <div className={cn("flex h-10 items-center justify-between gap-2 px-3", className)}>
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className="shrink-0 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Total mensual
        </span>
        {isUf && totalUf != null ? (
          <>
            <span className="font-mono text-[15px] font-bold tabular-nums text-status-ok-fg">
              {totalUf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF
            </span>
            <span className="truncate text-[12px] tabular-nums text-muted-foreground">
              {formatCLP(totalClp)}
            </span>
          </>
        ) : (
          <>
            <span className="font-mono text-[15px] font-bold tabular-nums text-status-ok-fg">
              {formatCLP(totalClp)}
            </span>
            {totalUf != null && (
              <span className="truncate text-[12px] tabular-nums text-muted-foreground">
                {totalUf.toLocaleString("es-CL", { maximumFractionDigits: 2 })} UF
              </span>
            )}
          </>
        )}
        {saving && (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        )}
      </div>
      {hasUf && (
        <span
          className="shrink-0 rounded-full border border-border/60 bg-ds-surface-2/70 px-2.5 py-0.5 font-mono text-[12px] tabular-nums text-muted-foreground"
          title="Valor UF del día"
        >
          UF {formatCLP(ufValue as number)}
        </span>
      )}
    </div>
  );
}
