"use client";
import { useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  /** Drift en CLP del bucket actual (real - proyectado). Si null o |x| < umbral, no renderiza. */
  driftClp: number | null;
  /** Callback al apretar "Crear ajuste". Recibe el monto del drift con signo. */
  onCreateAdjustment: (amountClp: number) => void;
  /** Umbral mínimo absoluto en CLP. Default $10.000. */
  thresholdClp?: number;
}

const fmt = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

export function CashflowDriftBanner({
  driftClp,
  onCreateAdjustment,
  thresholdClp = 10_000,
}: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (driftClp == null || Math.abs(driftClp) < thresholdClp) return null;

  const direction = driftClp > 0 ? "encima" : "debajo";
  const absAmount = Math.abs(driftClp);

  return (
    <div className="rounded-ds-md border border-status-warn-border/50 bg-status-warn-soft/30 px-3 py-2.5 flex items-start gap-2.5">
      <AlertTriangle className="h-4 w-4 text-status-warn-fg mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] leading-snug text-ds-text-1">
          Tu saldo banco real está{" "}
          <strong className="font-semibold tabular-nums">
            {fmt.format(absAmount)}
          </strong>{" "}
          {direction} del proyectado.
        </p>
        <p className="text-[11px] text-ds-text-3 mt-0.5">
          Podés crear un ítem de ajuste para recalibrar el flujo, o ignorar y
          dejar el drift como histórico.
        </p>
        <div className="flex gap-2 mt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onCreateAdjustment(driftClp)}
            className="h-7 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" /> Crear ajuste
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDismissed(true)}
            className="h-7 text-xs"
          >
            Ignorar
          </Button>
        </div>
      </div>
    </div>
  );
}
