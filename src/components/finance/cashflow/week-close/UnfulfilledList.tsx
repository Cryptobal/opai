"use client";
import { useState } from "react";
import { Calendar, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MarkPaidDialog } from "./MarkPaidDialog";
import type { WeeklyCloseSnapshotDTO } from "./types";
import { fmtCLP } from "./types";

interface Props {
  items: WeeklyCloseSnapshotDTO["unfulfilledProj"];
  onAction: () => void;
}

/**
 * Cuotas proyectadas no cumplidas en la semana. Tres acciones por fila:
 * mover a próxima semana, marcar pagada, cancelar.
 */
export function UnfulfilledList({ items, onAction }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [paidDialog, setPaidDialog] = useState<{
    id: string;
    defaultAmount: number;
    itemName: string;
  } | null>(null);

  async function moveNextWeek(occId: string, scheduledIso: string) {
    setBusyId(occId);
    try {
      const base = new Date(scheduledIso);
      const nd = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 7);
      const yyyy = nd.getFullYear();
      const mm = String(nd.getMonth() + 1).padStart(2, "0");
      const dd = String(nd.getDate()).padStart(2, "0");
      const res = await fetch(`/api/finance/cashflow/occurrences/${occId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newDate: `${yyyy}-${mm}-${dd}`,
          resolveStrategy: "next_free",
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || "Error al mover");
      toast.success("Cuota movida a la próxima semana");
      onAction();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyId(null);
    }
  }

  async function cancelOcc(occId: string) {
    if (!confirm("¿Cancelar esta cuota? La semana queda con menos plata esperada.")) {
      return;
    }
    setBusyId(occId);
    try {
      const res = await fetch(`/api/finance/cashflow/occurrences/${occId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      toast.success("Cuota cancelada");
      onAction();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-md border border-border/60">
      <div className="px-3 py-2 border-b border-border/60 bg-muted/30 text-xs font-medium text-ds-text-2">
        Cuotas proyectadas no cumplidas ({items.length})
      </div>
      <ul className="divide-y divide-border/60">
        {items.map((p) => (
          <li
            key={p.occurrenceId}
            className="px-3 py-2.5 flex items-start justify-between gap-3 text-sm"
          >
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs text-muted-foreground">
                {new Date(p.scheduledDate).toLocaleDateString("es-CL", {
                  day: "2-digit",
                  month: "short",
                })}{" "}
                · {p.categoryCode}
              </div>
              <div className="truncate" title={p.itemName}>
                {p.itemName}
                {p.installationName && (
                  <span className="text-ds-text-3"> — {p.installationName}</span>
                )}
              </div>
              <div
                className={`text-sm font-mono tabular-nums font-semibold ${p.kind === "INCOME" ? "text-status-ok-fg" : "text-status-warn-fg"}`}
              >
                {p.kind === "INCOME" ? "+" : "−"}
                {fmtCLP.format(p.amountClp)}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2"
                onClick={() => moveNextWeek(p.occurrenceId, p.scheduledDate)}
                disabled={busyId === p.occurrenceId}
                title="Mover a próxima semana"
              >
                {busyId === p.occurrenceId ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Calendar className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2"
                onClick={() =>
                  setPaidDialog({
                    id: p.occurrenceId,
                    defaultAmount: p.amountClp,
                    itemName: p.itemName,
                  })
                }
                disabled={busyId === p.occurrenceId}
                title="Marcar pagada"
              >
                <Check className="h-3.5 w-3.5 text-status-ok-fg" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2"
                onClick={() => cancelOcc(p.occurrenceId)}
                disabled={busyId === p.occurrenceId}
                title="Cancelar cuota"
              >
                <X className="h-3.5 w-3.5 text-status-warn-fg" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {paidDialog && (
        <MarkPaidDialog
          open={true}
          onClose={() => setPaidDialog(null)}
          onConfirmed={() => {
            setPaidDialog(null);
            onAction();
          }}
          occurrenceId={paidDialog.id}
          itemName={paidDialog.itemName}
          defaultAmount={paidDialog.defaultAmount}
        />
      )}
    </div>
  );
}
