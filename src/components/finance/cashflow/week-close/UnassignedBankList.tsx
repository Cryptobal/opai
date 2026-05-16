"use client";
import { useState } from "react";
import { ExternalLink, Repeat, Zap, Loader2, FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CreateItemFromBankTxDialog } from "./CreateItemFromBankTxDialog";
import type { WeeklyCloseSnapshotDTO } from "./types";
import { fmtCLP } from "./types";

interface Props {
  items: WeeklyCloseSnapshotDTO["unassignedBank"];
  onAction: () => void;
}

type DialogState = {
  bankTxId: string;
  amount: number;
  description: string;
  mode: "recurrent" | "once";
} | null;

/**
 * Sub-lista de movimientos bancarios sin asignar a una occurrence durante
 * la semana. Cuatro acciones por fila:
 *   - Conciliar: deep-link a /finanzas/bancos/movimientos para conciliar
 *     manualmente desde la pantalla dedicada.
 *   - Recurrente: abre dialog que crea un FinanceCashflowItem nuevo con
 *     recurrence configurable y vincula la occurrence PAID en esta fecha.
 *   - Puntual: idem pero con recurrence='ONCE'.
 *   - Ajuste: crea un FinanceCashflowItem source=AJUSTE en la categoría
 *     ING/EGR_AJUSTE_CONCILIACION del tenant y vincula la occurrence PAID.
 */
export function UnassignedBankList({ items, onAction }: Props) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [creatingAjusteFor, setCreatingAjusteFor] = useState<string | null>(
    null,
  );

  async function quickAjuste(id: string, amount: number, description: string) {
    setCreatingAjusteFor(id);
    try {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const res = await fetch("/api/finance/cashflow/ajustes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountClp: amount,
          effectiveDate: `${yyyy}-${mm}-${dd}`,
          notes: `Ajuste desde mov banco no clasificado: ${description.slice(0, 200)}`,
          bankTransactionId: id,
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      toast.success("Ajuste contable creado y vinculado");
      onAction();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear ajuste");
    } finally {
      setCreatingAjusteFor(null);
    }
  }

  return (
    <div className="rounded-md border border-border/60">
      <div className="px-3 py-2 border-b border-border/60 bg-muted/30 text-xs font-medium text-ds-text-2">
        Movimientos banco sin asignar ({items.length})
      </div>
      <ul className="divide-y divide-border/60">
        {items.map((tx) => (
          <li
            key={tx.id}
            className="px-3 py-2.5 flex items-start justify-between gap-3 text-sm"
          >
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs text-muted-foreground">
                {new Date(tx.transactionDate).toLocaleDateString("es-CL", {
                  day: "2-digit",
                  month: "short",
                })}
              </div>
              <div className="truncate" title={tx.description}>
                {tx.description}
              </div>
              <div
                className={`text-sm font-mono tabular-nums font-semibold ${tx.amount >= 0 ? "text-status-ok-fg" : "text-status-warn-fg"}`}
              >
                {tx.amount >= 0 ? "+" : ""}
                {fmtCLP.format(tx.amount)}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2"
                onClick={() =>
                  window.open(
                    `/finanzas/bancos/movimientos?txId=${tx.id}`,
                    "_blank",
                  )
                }
                title="Conciliar en la pantalla de bancos"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2"
                onClick={() =>
                  setDialog({
                    bankTxId: tx.id,
                    amount: tx.amount,
                    description: tx.description,
                    mode: "recurrent",
                  })
                }
                title="Crear flujo recurrente nuevo"
              >
                <Repeat className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2"
                onClick={() =>
                  setDialog({
                    bankTxId: tx.id,
                    amount: tx.amount,
                    description: tx.description,
                    mode: "once",
                  })
                }
                title="Crear flujo puntual"
              >
                <Zap className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2"
                onClick={() => quickAjuste(tx.id, tx.amount, tx.description)}
                disabled={creatingAjusteFor === tx.id}
                title="Crear ajuste contable"
              >
                {creatingAjusteFor === tx.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FilePlus className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {dialog && (
        <CreateItemFromBankTxDialog
          open={true}
          onClose={() => setDialog(null)}
          onCreated={() => {
            setDialog(null);
            onAction();
          }}
          bankTxId={dialog.bankTxId}
          bankTxAmount={dialog.amount}
          bankTxDescription={dialog.description}
          mode={dialog.mode}
        />
      )}
    </div>
  );
}
