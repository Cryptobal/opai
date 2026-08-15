"use client";

/**
 * Fila 1 del stack sticky móvil CPQ: PulseBar quote (estado · total · acciones).
 * API estable para CpqQuoteDetail / QuoteWorkspace.
 */

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PulseBar } from "@/components/workbench";

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

  const primary =
    totalClp == null || !Number.isFinite(totalClp)
      ? "—"
      : isUf && totalUf != null
        ? `${totalUf.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`
        : formatCLP(totalClp);

  const secondaryParts: string[] = [];
  if (isUf && Number.isFinite(totalClp)) {
    secondaryParts.push(formatCLP(totalClp));
  } else if (totalUf != null) {
    secondaryParts.push(
      `${totalUf.toLocaleString("es-CL", { maximumFractionDigits: 2 })} UF`,
    );
  }
  if (hasUf) {
    secondaryParts.push(`UF ${formatCLP(ufValue as number)}`);
  }
  if (saving) secondaryParts.push("guardando…");
  const secondary = secondaryParts.join(" · ");

  return (
    <PulseBar
      variant="quote"
      statusSlot={statusSlot}
      value={
        <span className="inline-flex items-center gap-1.5">
          {primary}
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-ds-text-3" aria-hidden />
          ) : null}
        </span>
      }
      subtitle={secondary || undefined}
      actionsSlot={actionsSlot}
      className={cn(className)}
    />
  );
}
