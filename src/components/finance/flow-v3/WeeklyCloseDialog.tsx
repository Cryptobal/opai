"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtClp, formatThousands, parseSignedAmount } from "./format";

interface Snapshot {
  weekStartYmd: string;
  weekEndYmd: string;
  weekLabel: string;
  bankBalanceClp: number;
  projectedBalanceClp: number;
  varianceClp: number;
  unassignedBankCount: number;
  unfulfilledProjCount: number;
  alreadyClosed: boolean;
  isFuture: boolean;
  v2WeekEndYmd: string;
}

/** Diálogo de cierre semanal (§5G). Cierra la semana v3 reutilizando el servicio
 *  v2 vía el adaptador; saldo bancario sugerido editable, varianza en vivo. */
export function WeeklyCloseDialog({
  open, initialWeekEnd, busy, getProjected, onClose, onConfirm, onReopen,
}: {
  open: boolean;
  /** Domingo (YMD) de la semana a cerrar por defecto. */
  initialWeekEnd: string;
  busy: boolean;
  /** Saldo proyectado de cierre de la matriz para el lunes de esa semana. */
  getProjected: (mondayYmd: string) => number | null;
  onClose: () => void;
  onConfirm: (body: {
    weekEnd: string;
    closedBalance: number;
    notes?: string;
    manualReason?: string;
  }) => Promise<{ ok: true } | { ok: false; reason: string }>;
  onReopen: (weekEnd: string) => void;
}) {
  const [weekEnd, setWeekEnd] = useState(initialWeekEnd);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balanceStr, setBalanceStr] = useState("");
  const [notes, setNotes] = useState("");
  const [manualReason, setManualReason] = useState("");

  useEffect(() => {
    if (open) setWeekEnd(initialWeekEnd);
  }, [open, initialWeekEnd]);

  const load = useCallback(async (we: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance/flow-v3/weekly-close/snapshot?weekEnd=${we}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Error");
      const s = json.data as Snapshot;
      setSnap(s);
      setBalanceStr(formatThousands(String(Math.abs(s.bankBalanceClp))));
      setManualReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el cierre");
      setSnap(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load(weekEnd);
  }, [open, weekEnd, load]);

  if (!open) return null;

  const shiftWeek = (dir: -1 | 1) => {
    const base = Date.parse(`${weekEnd}T00:00:00Z`);
    if (Number.isNaN(base)) return;
    setWeekEnd(new Date(base + dir * 7 * 86_400_000).toISOString().slice(0, 10));
  };

  const closedBalance = parseSignedAmount(balanceStr || "0");
  const bankSuggested = snap?.bankBalanceClp ?? 0;
  const projected = snap ? getProjected(snap.weekStartYmd) ?? snap.projectedBalanceClp : 0;
  const variance = closedBalance - projected;
  const differsFromBank = snap ? Math.abs(closedBalance - bankSuggested) > 1 : false;
  const needsReason = differsFromBank;
  const reasonOk = !needsReason || manualReason.trim().length >= 5;

  const varianceTone =
    variance === 0
      ? "text-status-ok-fg"
      : Math.abs(variance) < 1_000_000
        ? "text-status-warn-fg"
        : "text-status-danger-fg";

  const confirm = async () => {
    if (!snap) return;
    const r = await onConfirm({
      weekEnd: snap.weekEndYmd,
      closedBalance,
      notes: notes.trim() || undefined,
      manualReason: needsReason ? manualReason.trim() : undefined,
    });
    if (r.ok) onClose();
    else setError(r.reason);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cerrar semana</DialogTitle>
        </DialogHeader>

        <div className="mb-2 flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => shiftWeek(-1)} aria-label="Semana anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-mono text-[13px] uppercase tracking-wide text-ds-text-2">
            {snap ? `${snap.weekLabel} · ${snap.weekStartYmd} → ${snap.weekEndYmd}` : weekEnd}
          </span>
          <Button variant="outline" size="sm" onClick={() => shiftWeek(1)} aria-label="Semana siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-ds-text-3">Cargando…</div>
        ) : error ? (
          <div className="rounded border border-status-danger-border bg-status-danger-soft/40 px-2 py-2 text-sm text-status-danger-fg">
            {error}
          </div>
        ) : !snap ? null : snap.alreadyClosed ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded border border-ds-border-default bg-ds-surface-2 px-2 py-2 text-sm text-ds-text-2">
              <Lock className="h-4 w-4 shrink-0 text-ds-text-3" />
              Esta semana ya está cerrada (sellada).
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cerrar</Button>
              <Button variant="destructive" disabled={busy} onClick={() => onReopen(snap.weekEndYmd)}>
                {busy ? "Reabriendo…" : "Reabrir semana"}
              </Button>
            </DialogFooter>
          </div>
        ) : snap.isFuture ? (
          <div className="space-y-3">
            <p className="rounded border border-status-warn-border bg-status-warn-soft/40 px-2 py-2 text-sm text-status-warn-fg">
              No se puede cerrar una semana futura.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cerrar</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded border border-ds-border-subtle px-2 py-1.5">
                <p className="text-xs text-ds-text-4">Proyectado (matriz)</p>
                <p className="tabular-nums text-ds-text-1">{fmtClp(projected)}</p>
              </div>
              <div className="rounded border border-ds-border-subtle px-2 py-1.5">
                <p className="text-xs text-ds-text-4">Varianza</p>
                <p className={`tabular-nums ${varianceTone}`}>{fmtClp(variance)}</p>
              </div>
            </div>

            <label className="block space-y-1 text-xs text-ds-text-3">
              <span>Saldo de cierre (sugerido: banco {fmtClp(bankSuggested)})</span>
              <Input
                inputMode="numeric"
                value={balanceStr}
                onChange={(e) => setBalanceStr(formatThousands(e.target.value))}
              />
            </label>

            <div className="flex gap-3 text-xs text-ds-text-3">
              <span>
                Sin asignar: <span className="text-ds-text-1">{snap.unassignedBankCount}</span>
              </span>
              <span>
                Proy. no cumplidas: <span className="text-ds-text-1">{snap.unfulfilledProjCount}</span>
              </span>
            </div>

            {needsReason && (
              <label className="block space-y-1 text-xs text-ds-text-3">
                <span className="text-status-warn-fg">
                  El saldo difiere del banco: indica el motivo (mín. 5 caracteres)
                </span>
                <Input value={manualReason} onChange={(e) => setManualReason(e.target.value)} placeholder="Ej: cheque en tránsito" />
              </label>
            )}

            <label className="block space-y-1 text-xs text-ds-text-3">
              <span>Notas (opcional)</span>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button disabled={busy || !reasonOk} onClick={confirm}>
                {busy ? "Cerrando…" : "Cerrar semana"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
