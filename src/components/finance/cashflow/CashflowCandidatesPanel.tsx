"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ArrowRight, AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Candidate {
  occurrenceId: string | null;
  itemId: string;
  itemName: string;
  installationName: string | null;
  categoryCode: string;
  categoryName: string;
  kind: "INCOME" | "EXPENSE";
  projectedDate: string;
  projectedAmountClp: number;
  bankAmountClp: number;
  varianceClp: number;
  daysDelta: number;
  confidence: number;
  matchReason: "ACCOUNT_MAPPED" | "CATEGORY_KIND" | "AMOUNT_ONLY";
}

interface Props {
  bankTransactionId: string;
  onMatched: () => void;
}

const fmt = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

export function CashflowCandidatesPanel({ bankTransactionId, onMatched }: Props) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/finance/banking/transactions/${bankTransactionId}/cashflow-candidates`,
      );
      const j = await res.json();
      if (!j?.success) throw new Error(j?.error ?? "Error al cargar");
      setCandidates(j.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [bankTransactionId]);

  useEffect(() => {
    if (bankTransactionId) load();
  }, [bankTransactionId, load]);

  const confirm = async (c: Candidate) => {
    if (!c.occurrenceId) return;
    setConfirming(c.occurrenceId);
    try {
      const res = await fetch(
        `/api/finance/cashflow/occurrences/${c.occurrenceId}/confirm-match`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bankTransactionId,
            rebalanceDate: true,
            rebalanceAmount: true,
          }),
        },
      );
      const j = await res.json();
      if (!j?.success) throw new Error(j?.error ?? "Error al confirmar");
      toast.success(`Cuota rebalanceada y marcada como pagada`);
      onMatched();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setConfirming(null);
    }
  };

  if (loading)
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando candidatos...
      </div>
    );

  if (error)
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-status-warn-fg">
        <AlertCircle className="h-3.5 w-3.5" /> {error}
      </div>
    );

  if (!candidates || candidates.length === 0)
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        No se encontraron cuotas proyectadas que coincidan con este movimiento.
        <br />
        Probá ampliar la ventana o crear un item ad-hoc.
      </div>
    );

  return (
    <ul className="space-y-2">
      {candidates.map((c, idx) => {
        const isBest = idx === 0;
        const isConfirming = confirming === c.occurrenceId;
        const variancePct = (c.varianceClp / c.projectedAmountClp) * 100;
        const projectedDate = new Date(c.projectedDate);
        const daysSign = c.daysDelta > 0 ? "+" : "";
        return (
          <li
            key={c.occurrenceId ?? `virt-${idx}`}
            className={cn(
              "rounded-md border bg-card p-3 transition",
              isBest ? "border-primary/40 ring-1 ring-primary/20" : "border-border",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    {c.categoryCode}
                  </span>
                  {isBest && (
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                      mejor match
                    </span>
                  )}
                  {c.matchReason === "ACCOUNT_MAPPED" && (
                    <span className="text-[10px] font-mono uppercase text-status-info-fg">
                      cuenta mapeada
                    </span>
                  )}
                </div>
                <h4 className="font-medium text-[13px] leading-tight">
                  {c.itemName}
                  {c.installationName ? (
                    <span className="text-muted-foreground"> · {c.installationName}</span>
                  ) : null}
                </h4>
                <div className="mt-1.5 grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <div className="text-[9.5px] uppercase font-mono text-muted-foreground">Fecha</div>
                    <div className="font-mono">
                      {projectedDate.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" })}
                    </div>
                    <div className="text-[10px] text-status-warn-fg">
                      {daysSign}
                      {c.daysDelta}d
                    </div>
                  </div>
                  <div>
                    <div className="text-[9.5px] uppercase font-mono text-muted-foreground">Proyect.</div>
                    <div className="font-mono">{fmt.format(c.projectedAmountClp)}</div>
                    <div className={cn("text-[10px]", c.varianceClp !== 0 ? "text-status-warn-fg" : "text-muted-foreground")}>
                      Δ {variancePct > 0 ? "+" : ""}
                      {variancePct.toFixed(0)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[9.5px] uppercase font-mono text-muted-foreground">Confianza</div>
                    <div className="font-mono font-semibold">{c.confidence}</div>
                  </div>
                </div>
              </div>
            </div>

            {isBest && (
              <div className="mt-3 rounded bg-muted/40 p-2 text-[11px] text-muted-foreground space-y-1">
                <div className="text-[10px] font-mono uppercase text-primary tracking-[0.08em]">Al confirmar:</div>
                <div>· Mueve fecha de cuota a {projectedDate.toLocaleDateString("es-CL")}</div>
                <div>
                  · Ajusta monto a {fmt.format(c.bankAmountClp)}{" "}
                  {c.varianceClp !== 0 && (
                    <span className="text-status-warn-fg">
                      (varianza {c.varianceClp > 0 ? "+" : ""}
                      {fmt.format(c.varianceClp)})
                    </span>
                  )}
                </div>
                <div>· Marca cuota PAID, no modifica la regla maestra</div>
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                className="h-8 text-[12px]"
                onClick={() => confirm(c)}
                disabled={isConfirming || !c.occurrenceId}
              >
                {isConfirming ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Check className="h-3 w-3 mr-1" />
                )}
                Es este — asignar y rebalancear
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-[12px]" disabled={isConfirming}>
                No es <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
