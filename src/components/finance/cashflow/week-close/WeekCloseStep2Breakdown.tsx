"use client";
import { useState } from "react";
import { Scale, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { UnassignedBankList } from "./UnassignedBankList";
import { UnfulfilledList } from "./UnfulfilledList";
import type { WeeklyCloseSnapshotDTO } from "./types";
import { fmtCLP } from "./types";

interface Props {
  snap: WeeklyCloseSnapshotDTO;
  onAnyAction: () => void;
}

/**
 * Paso 2 del cierre semanal: desglose por línea de la diferencia.
 *
 * Una sección por cada tipo de discrepancia:
 *   - Bank txs sin asignar (con 4 acciones por fila)
 *   - Cuotas no cumplidas (con 3 acciones por fila)
 *   - Residual: lo que queda de la diferencia tras restar lo explicado
 *     por las dos secciones. Si > 50k, sugiere crear un ajuste contable
 *     manual via POST /api/finance/cashflow/ajustes.
 */
export function WeekCloseStep2Breakdown({ snap, onAnyAction }: Props) {
  const [creatingAjuste, setCreatingAjuste] = useState(false);

  // Residual = variance - (lo no asignado, con su signo) + (lo no cumplido,
  // ponderado por kind: INCOME pendiente = banco menor, EXPENSE pendiente =
  // banco mayor).
  const unassignedNet = snap.unassignedBank.reduce((s, b) => s + b.amount, 0);
  const unfulfilledImpact = snap.unfulfilledProj.reduce(
    (s, p) => s + (p.kind === "INCOME" ? -p.amountClp : p.amountClp),
    0,
  );
  const residual = snap.varianceClp - unassignedNet - unfulfilledImpact;
  const showResidual = Math.abs(residual) >= 50_000;

  async function createResidualAjuste() {
    setCreatingAjuste(true);
    try {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const res = await fetch("/api/finance/cashflow/ajustes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountClp: Math.round(residual),
          effectiveDate: `${yyyy}-${mm}-${dd}`,
          notes: "Ajuste por residual del cierre semanal",
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      toast.success("Ajuste contable creado");
      onAnyAction();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear ajuste");
    } finally {
      setCreatingAjuste(false);
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Scale className="h-4 w-4 text-ds-text-3" />
        2. Desglosar la diferencia
      </h3>

      {snap.unassignedBank.length > 0 && (
        <UnassignedBankList items={snap.unassignedBank} onAction={onAnyAction} />
      )}

      {snap.unfulfilledProj.length > 0 && (
        <UnfulfilledList items={snap.unfulfilledProj} onAction={onAnyAction} />
      )}

      {snap.unassignedBank.length === 0 && snap.unfulfilledProj.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          Sin movimientos pendientes en la semana.
        </p>
      )}

      {showResidual && (
        <div className="flex items-center justify-between rounded-md border border-status-warn-border bg-status-warn-soft px-3 py-2 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Residual</div>
            <div className="font-mono tabular-nums font-semibold">
              {residual > 0 ? "+" : ""}
              {fmtCLP.format(residual)}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={createResidualAjuste}
            disabled={creatingAjuste}
          >
            {creatingAjuste ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : null}
            Crear ajuste contable
          </Button>
        </div>
      )}
    </section>
  );
}
