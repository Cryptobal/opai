"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Search, Link2 } from "lucide-react";
import { Surface, Spinner } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import { fmtCLP, toDate } from "./format";

interface UnassignedTx {
  id: string;
  transactionDate: string;
  description: string;
  amount: number;
  accountPlanCode: string | null;
}

/** Subset de CashflowCandidate que consume la banda (evita importar el módulo
 *  server-only del candidate-finder en el bundle del cliente). */
interface Candidate {
  occurrenceId: string | null;
  itemName: string;
  installationName: string | null;
  confidence: number;
  projectedAmountClp: number;
}

/**
 * Banda de conciliación del bucket actual/pasado abierto. Lista los bank tx sin
 * conciliar (reusa el snapshot del cierre semanal) y, por cada uno, el mejor
 * candidato del candidate-finder con su confianza. Confirmar concilia la
 * occurrence; bajo 60% o sin occurrence materializada se ofrece "Buscar".
 */
export function ReconcileBand({ bucket }: { bucket: ProjectionBucket }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [txs, setTxs] = useState<UnassignedTx[]>([]);
  const [candidates, setCandidates] = useState<Record<string, Candidate[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    let abort = false;
    setLoading(true);
    const weekEnd = encodeURIComponent(toDate(bucket.end).toISOString());
    fetch(`/api/finance/cashflow/weekly-close/snapshot?weekEnd=${weekEnd}`)
      .then((r) => r.json())
      .then(async (j) => {
        if (abort) return;
        const list: UnassignedTx[] = j?.success ? j.data.unassignedBank ?? [] : [];
        setTxs(list);
        const entries = await Promise.all(
          list.map(async (t) => {
            const cr = await fetch(
              `/api/finance/banking/transactions/${t.id}/cashflow-candidates`,
            );
            const cj = await cr.json();
            return [t.id, (cj?.success ? cj.data : []) as Candidate[]] as const;
          }),
        );
        if (!abort) setCandidates(Object.fromEntries(entries));
      })
      .catch(() => !abort && setTxs([]))
      .finally(() => !abort && setLoading(false));
    return () => {
      abort = true;
    };
  }, [bucket.key, bucket.end]);

  async function confirm(txId: string, occurrenceId: string) {
    setConfirming(txId);
    try {
      const r = await fetch(
        `/api/finance/cashflow/occurrences/${occurrenceId}/confirm-match`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bankTransactionId: txId }),
        },
      );
      const j = await r.json();
      if (!j?.success) {
        toast.error(j?.error ?? "No se pudo conciliar");
        return;
      }
      toast.success("Conciliado");
      setTxs((prev) => prev.filter((t) => t.id !== txId));
      router.refresh();
    } catch {
      toast.error("Error al conciliar");
    } finally {
      setConfirming(null);
    }
  }

  return (
    <Surface padding="sm">
      <div className="mb-2 flex items-center gap-2">
        <Link2 className="h-4 w-4 text-ds-text-3" />
        <h3 className="text-[13px] font-semibold text-ds-text-1">Conciliación</h3>
        {!loading && (
          <span className="font-mono text-[12px] text-ds-text-3">{txs.length}</span>
        )}
      </div>

      {loading ? (
        <Spinner size="sm" label="Buscando movimientos…" />
      ) : txs.length === 0 ? (
        <p className="text-[12px] text-ds-text-3">Todo conciliado en esta semana.</p>
      ) : (
        <div className="space-y-2">
          {txs.map((t) => {
            const list = candidates[t.id] ?? [];
            const top = list[0];
            const canConfirmTop =
              top && top.occurrenceId != null && top.confidence >= 60;
            const isExpanded = expanded.has(t.id);
            return (
              <div
                key={t.id}
                className="rounded-ds-md border border-ds-border-subtle p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] text-ds-text-1">
                    {t.description || "Movimiento bancario"}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[12px] tabular-nums",
                      t.amount < 0 ? "text-status-danger-fg" : "text-status-ok-fg",
                    )}
                  >
                    {fmtCLP.format(t.amount)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  {top ? (
                    <span className="min-w-0 truncate text-[12px] text-ds-text-3">
                      {top.itemName}
                      {top.installationName ? ` · ${top.installationName}` : ""}{" "}
                      <span className="font-mono">({top.confidence}%)</span>
                    </span>
                  ) : (
                    <span className="text-[12px] text-ds-text-3">Sin candidatos</span>
                  )}
                  {canConfirmTop ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 text-[12px]"
                      disabled={confirming === t.id}
                      onClick={() => confirm(t.id, top!.occurrenceId!)}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" /> Confirmar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 shrink-0 text-[12px]"
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(t.id)) next.delete(t.id);
                          else next.add(t.id);
                          return next;
                        })
                      }
                    >
                      <Search className="mr-1 h-3.5 w-3.5" /> Buscar
                    </Button>
                  )}
                </div>
                {isExpanded && list.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-ds-border-subtle pt-2">
                    {list.map((c, i) => (
                      <div
                        key={c.occurrenceId ?? `c-${i}`}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="min-w-0 truncate text-[12px] text-ds-text-2">
                          {c.itemName}{" "}
                          <span className="font-mono text-ds-text-3">
                            {fmtCLP.format(c.projectedAmountClp)} · {c.confidence}%
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 shrink-0 text-[11px]"
                          disabled={c.occurrenceId == null || confirming === t.id}
                          onClick={() => c.occurrenceId && confirm(t.id, c.occurrenceId)}
                        >
                          Confirmar
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Surface>
  );
}
