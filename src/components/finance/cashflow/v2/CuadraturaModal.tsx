"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, X, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fmtCLP, toDate } from "./format";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import { BankTxRow, type BankTx } from "./BankTxRow";
import {
  CuadraturaFilters,
  type FilterType,
  type FilterState,
} from "./CuadraturaFilters";
import { CierreBlock, type CierreConfirmInput } from "./CierreBlock";

interface SnapshotData {
  weekStartDate: string;
  weekEndDate: string;
  bankBalanceClp: number;
  projectedBalanceClp: number;
  varianceClp: number;
  allBank: BankTx[];
}

interface Props {
  open: boolean;
  bucket: ProjectionBucket | null;
  canManage: boolean;
  onClose: () => void;
}

interface BatchGroup {
  key: string;
  label: string;
  date: string;
  accountPlanCode: string | null;
  txs: BankTx[];
  totalAmount: number;
}

function groupByBatch(txs: BankTx[]): { groups: BatchGroup[]; singles: BankTx[] } {
  const buckets = new Map<string, BankTx[]>();
  for (const t of txs) {
    const dateStr = new Date(t.transactionDate).toISOString().slice(0, 10);
    const k = `${dateStr}|${t.accountPlanCode ?? ""}|${t.matchedItemName ?? "?"}`;
    const list = buckets.get(k);
    if (list) list.push(t);
    else buckets.set(k, [t]);
  }
  const groups: BatchGroup[] = [];
  const singles: BankTx[] = [];
  for (const [key, list] of buckets) {
    if (list.length >= 3) {
      groups.push({
        key,
        label: list[0].matchedItemName ?? "Pago grupal",
        date: list[0].transactionDate,
        accountPlanCode: list[0].accountPlanCode,
        txs: list,
        totalAmount: list.reduce((s, t) => s + t.amount, 0),
      });
    } else {
      singles.push(...list);
    }
  }
  return { groups, singles };
}

/**
 * Modal de cuadratura: comparativo proyectado/banco/diferencia, filtros
 * combinables, secciones Pendientes / Conciliados (con agrupación por lote) /
 * Excluidos, y el bloque de cierre (real o manual). Reemplaza a ReconcileBand y
 * a las páginas /cuadratura y /cierre.
 */
export function CuadraturaModal({ open, bucket, canManage, onClose }: Props) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [bankConnected, setBankConnected] = useState(true);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [fType, setFType] = useState<FilterType>("all");
  const [fState, setFState] = useState<FilterState>("all");

  const weekEndIso = bucket ? toDate(bucket.end).toISOString() : null;

  const load = useCallback(async () => {
    if (!weekEndIso) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/finance/cashflow/weekly-close?weekEnd=${encodeURIComponent(weekEndIso)}`,
      );
      const j = await res.json();
      if (j?.success) {
        setSnapshot(j.data.snapshot as SnapshotData);
        setBankConnected(j.data.bankConnected ?? true);
      }
    } finally {
      setLoading(false);
    }
  }, [weekEndIso]);

  useEffect(() => {
    if (!open || !weekEndIso) return;
    setSnapshot(null);
    void load();
  }, [open, weekEndIso, load]);

  const allBank = useMemo(() => snapshot?.allBank ?? [], [snapshot]);

  const stateOf = (t: BankTx): FilterState =>
    t.excludedReason ? "excluded" : t.matchedOccurrenceId ? "matched" : "pending";
  const typeOf = (t: BankTx): "income" | "expense" => (t.amount > 0 ? "income" : "expense");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allBank.filter((t) => {
      if (fType !== "all" && typeOf(t) !== fType) return false;
      if (fState !== "all" && stateOf(t) !== fState) return false;
      if (
        q &&
        !t.description.toLowerCase().includes(q) &&
        !(t.accountPlanCode ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [allBank, search, fType, fState]);

  const vPending = visible.filter((t) => stateOf(t) === "pending");
  const vMatched = visible.filter((t) => stateOf(t) === "matched");
  const vExcluded = visible.filter((t) => stateOf(t) === "excluded");
  const matchedByBatch = useMemo(() => groupByBatch(vMatched), [vMatched]);

  const counts = useMemo(
    () => ({
      total: allBank.length,
      income: allBank.filter((t) => t.amount > 0).length,
      expense: allBank.filter((t) => t.amount < 0).length,
      pending: allBank.filter((t) => stateOf(t) === "pending").length,
      matched: allBank.filter((t) => stateOf(t) === "matched").length,
      excluded: allBank.filter((t) => stateOf(t) === "excluded").length,
    }),
    [allBank],
  );

  async function handleAccept(txId: string, occurrenceId: string) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/finance/cashflow/occurrences/${occurrenceId}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankTransactionId: txId }),
      });
      const j = await res.json();
      if (!j?.success) {
        toast.error(j?.error ?? "No se pudo calzar");
        return;
      }
      toast.success("Movimiento calzado");
      await load();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateManual(tx: BankTx) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/finance/cashflow/occurrences/from-bank-tx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankTransactionId: tx.id }),
      });
      const j = await res.json();
      if (!j?.success) {
        toast.error(j?.error ?? "No se pudo crear");
        return;
      }
      toast.success("Movimiento registrado en el flujo");
      await load();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleIgnore(txId: string) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/finance/banking/transactions/${txId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "hide", reason: "ignored_in_cuadratura" }),
      });
      const j = await res.json();
      if (!j?.success) {
        toast.error(j?.error ?? "No se pudo descartar");
        return;
      }
      toast.success("Movimiento descartado");
      await load();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmClose(input: CierreConfirmInput) {
    if (!bucket) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/finance/cashflow/weekly-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekEnd: toDate(bucket.end).toISOString(),
          anchor: true,
          mode: input.mode,
          forcedBalanceClp: input.forcedBalanceClp,
          manualReason: input.manualReason,
        }),
      });
      const j = await res.json();
      if (!j?.success) {
        toast.error(j?.error ?? "No se pudo cerrar");
        return;
      }
      toast.success(
        input.mode === "manual"
          ? `Cerrada manual con ${fmtCLP.format(input.forcedBalanceClp ?? 0)}${
              j.adjustCreated ? " (ajuste creado)" : ""
            }`
          : `Cerrada con saldo real ${fmtCLP.format(snapshot?.bankBalanceClp ?? 0)}`,
      );
      router.refresh();
      onClose();
    } catch {
      toast.error("Error de red al cerrar");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !bucket) return null;

  const projected = snapshot?.projectedBalanceClp ?? bucket.net;
  const bankReal = snapshot?.bankBalanceClp ?? 0;
  const diff = bankReal - projected;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full flex-col overflow-hidden rounded-ds-xl border border-ds-border-strong bg-ds-surface-1"
        style={{ width: 900, maxWidth: "100%", maxHeight: "95vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ds-border-default px-4 py-3">
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            <div>
              <h3 className="text-[15px] font-bold text-ds-text-1">
                Cuadrar y cerrar {bucket.label}
              </h3>
              <p className="text-[11px] text-ds-text-3">
                {vPending.length} requieren tu atención
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-ds-md p-2 text-ds-text-3 hover:bg-ds-surface-3 hover:text-ds-text-1"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="text-center text-[12px] text-ds-text-3">Cargando cartola…</div>
          )}
          {snapshot && (
            <>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <ComparativoCard title="Proyectado" value={projected} tone="neutral" />
                <ComparativoCard title="Banco real" value={bankReal} tone="brand" />
                <ComparativoCard
                  title="Diferencia"
                  value={diff}
                  tone={Math.abs(diff) < 100_000 ? "ok" : "warn"}
                  highlight
                />
              </div>

              {!bankConnected && (
                <div className="rounded-ds-md border border-status-warn-border bg-status-warn-soft px-3 py-2 text-[11px] text-status-warn-fg">
                  Banco no conectado — el cierre se hará en modo manual.
                </div>
              )}

              {allBank.length === 0 && (
                <div className="rounded-ds-lg border border-dashed border-ds-border-default bg-ds-surface-2 p-4 text-center">
                  <div className="text-[13px] font-semibold text-ds-text-1">
                    Sin movimientos bancarios cargados esta semana
                  </div>
                  <div className="mt-1.5 text-[11px] leading-relaxed text-ds-text-2">
                    El <b>Banco Real</b> que ves arriba (
                    <span className="tabular-nums">
                      {fmtCLP.format(snapshot.bankBalanceClp)}
                    </span>
                    ) es el saldo consolidado de tus cuentas al día de hoy — no la suma de
                    los movimientos de esta semana. Cuando se carguen movimientos (vía sync
                    automático o import manual), van a aparecer acá para conciliar.
                  </div>
                  {!bankConnected && (
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-ds-md bg-ds-warn/10 px-2.5 py-1 text-[11px] text-ds-warn">
                      ⚠ Banco no conectado · usá el cierre manual al pie
                    </div>
                  )}
                </div>
              )}

              {bankConnected && allBank.length > 0 && (
                <>
                  <CuadraturaFilters
                    search={search}
                    setSearch={setSearch}
                    fType={fType}
                    setFType={setFType}
                    fState={fState}
                    setFState={setFState}
                    counts={counts}
                    visibleCount={visible.length}
                  />

                  {vPending.length > 0 && (
                    <div className="overflow-hidden rounded-ds-lg border border-status-warn-border bg-ds-surface-2">
                      <div className="bg-status-warn-soft px-3 py-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-status-warn-fg">
                          Requieren tu atención · {vPending.length}
                        </span>
                      </div>
                      <div className="divide-y divide-ds-border-default">
                        {vPending.map((tx) => (
                          <BankTxRow
                            key={tx.id}
                            tx={tx}
                            onAccept={canManage ? handleAccept : undefined}
                            onCreateManual={canManage ? handleCreateManual : undefined}
                            onIgnore={canManage ? handleIgnore : undefined}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {vMatched.length > 0 && (
                    <div className="overflow-hidden rounded-ds-lg border border-ds-border-default bg-ds-surface-2">
                      <div className="flex items-center gap-2 bg-status-ok-soft px-3 py-2">
                        <Check className="h-3 w-3 text-status-ok-fg" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-status-ok-fg">
                          Conciliados · {vMatched.length}
                        </span>
                        <span className="ml-auto font-mono text-[10px] font-bold tabular-nums text-ds-text-2">
                          {fmtCLP.format(vMatched.reduce((s, t) => s + t.amount, 0))}
                        </span>
                      </div>
                      <div className="divide-y divide-ds-border-default">
                        {matchedByBatch.groups.map((g) => (
                          <BatchRow key={g.key} batch={g} />
                        ))}
                        {matchedByBatch.singles.map((tx) => (
                          <BankTxRow key={tx.id} tx={tx} dim />
                        ))}
                      </div>
                    </div>
                  )}

                  {vExcluded.length > 0 && (
                    <div className="overflow-hidden rounded-ds-lg border border-ds-border-default bg-ds-surface-2">
                      <div className="flex items-center gap-2 bg-ds-surface-3 px-3 py-2">
                        <X className="h-3 w-3 text-ds-text-3" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-ds-text-2">
                          Excluidos · {vExcluded.length}
                        </span>
                        <span className="ml-auto text-[9px] text-ds-text-3">
                          {vExcluded.filter((t) => t.excludedReason === "interna").length}{" "}
                          internas ·{" "}
                          {vExcluded.filter((t) => t.excludedReason === "comision").length}{" "}
                          comisiones
                        </span>
                      </div>
                      <div className="divide-y divide-ds-border-default">
                        {vExcluded.map((tx) => (
                          <BankTxRow key={tx.id} tx={tx} dim />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {canManage && (
                <CierreBlock
                  bankConnected={bankConnected}
                  projectedClp={projected}
                  bankClosingClp={bankReal}
                  submitting={submitting}
                  onConfirm={handleConfirmClose}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-ds-border-default bg-ds-surface-2 px-4 py-3">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <span className="text-[11px] text-ds-text-3">
            {canManage
              ? "Usa el bloque de cierre para anclar el saldo."
              : "Solo lectura — sin permisos para cerrar."}
          </span>
        </div>
      </div>
    </div>
  );
}

function ComparativoCard({
  title,
  value,
  tone,
  highlight,
}: {
  title: string;
  value: number;
  tone: "neutral" | "brand" | "ok" | "warn";
  highlight?: boolean;
}) {
  const colorMap: Record<typeof tone, string> = {
    neutral: "var(--ds-text-1)",
    brand: "var(--primary)",
    ok: "var(--ds-ok)",
    warn: "var(--ds-warn)",
  };
  return (
    <div
      className={`rounded-ds-lg border bg-ds-surface-2 p-3 ${
        highlight ? "border-status-warn-border" : "border-ds-border-default"
      }`}
    >
      <div className="mb-1 text-[10px] uppercase tracking-wider text-ds-text-3">{title}</div>
      <div
        className="font-mono text-2xl font-bold tabular-nums"
        style={{ color: colorMap[tone] }}
      >
        {fmtCLP.format(value)}
      </div>
    </div>
  );
}

function BatchRow({ batch }: { batch: BatchGroup }) {
  const isNeg = batch.totalAmount < 0;
  return (
    <div className="p-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-status-ok-soft">
            <Check className="h-2.5 w-2.5 text-status-ok-fg" />
          </span>
          <span className="text-[12px] font-medium text-ds-text-1">
            Pago {batch.label} · {batch.txs.length} lotes
          </span>
        </div>
        <span
          className="font-mono text-[12px] font-semibold tabular-nums"
          style={{ color: isNeg ? "var(--ds-danger)" : "var(--ds-ok)" }}
        >
          {isNeg ? "−" : "+"}
          {fmtCLP.format(Math.abs(batch.totalAmount))}
        </span>
      </div>
      <div className="ml-6 mt-0.5 text-[10px] text-status-ok-fg">
        calza con <b>{batch.label}</b> · 100%
      </div>
    </div>
  );
}
