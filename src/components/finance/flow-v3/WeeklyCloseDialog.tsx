"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtClp, formatThousands, parseSignedAmount } from "./format";

/** Formatea CLP firmado para el input (formatThousands solo digitos). */
function formatSigned(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  return sign + formatThousands(String(Math.abs(rounded)));
}

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

/** Lunes ISO (UTC) del domingo/día `ymd`. */
function mondayOf(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  const dow = d.getUTCDay(); // 0=dom … 1=lun
  const offset = dow === 0 ? -6 : 1 - dow;
  return new Date(d.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
}

/** Diálogo de cierre semanal. Formulario inmediato; el sugerido del banco
 *  llega con skeleton inline. Caché por weekEnd; navegación ‹ › con debounce. */
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
  const [loadingBank, setLoadingBank] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balanceStr, setBalanceStr] = useState("");
  const [notes, setNotes] = useState("");
  const [manualReason, setManualReason] = useState("");
  /** true si el usuario editó el input: no pisar con el sugerido del banco. */
  const userEditedRef = useRef(false);
  const cacheRef = useRef<Map<string, Snapshot>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadGenRef = useRef(0);

  // Al abrir: resetear estado local y caché (invalidar al reabrir).
  useEffect(() => {
    if (!open) return;
    setWeekEnd(initialWeekEnd);
    setNotes("");
    setManualReason("");
    setError(null);
    userEditedRef.current = false;
    cacheRef.current.clear();
    // Prefill inmediato con proyectado de la matriz.
    const monday = mondayOf(initialWeekEnd);
    const proj = getProjected(monday);
    if (proj != null) {
      // Prefill firmado: saldo negativo (línea de crédito) debe conservar el signo.
      setBalanceStr(formatSigned(proj));
    } else {
      setBalanceStr("");
    }
    setSnap(null);
  }, [open, initialWeekEnd, getProjected]);

  const applySnap = useCallback((s: Snapshot) => {
    setSnap(s);
    if (!userEditedRef.current) {
      // Prefill firmado (permite saldo bancario negativo).
      setBalanceStr(formatSigned(s.bankBalanceClp));
    }
    setManualReason("");
  }, []);

  const load = useCallback(async (we: string) => {
    const cached = cacheRef.current.get(we);
    if (cached) {
      applySnap(cached);
      setLoadingBank(false);
      setError(null);
      return;
    }
    const gen = ++loadGenRef.current;
    setLoadingBank(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance/flow-v3/weekly-close/snapshot?weekEnd=${we}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (gen !== loadGenRef.current) return;
      if (!json.success) throw new Error(json.error ?? "Error");
      const s = json.data as Snapshot;
      cacheRef.current.set(we, s);
      applySnap(s);
    } catch (err) {
      if (gen !== loadGenRef.current) return;
      setError(err instanceof Error ? err.message : "No se pudo cargar el cierre");
    } finally {
      if (gen === loadGenRef.current) setLoadingBank(false);
    }
  }, [applySnap]);

  // Carga con debounce 250 ms al cambiar weekEnd (navegación ‹ ›).
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Primera carga (sin snap aún) sin debounce; navegación sí.
    const delay = snap == null && !cacheRef.current.has(weekEnd) ? 0 : 250;
    // Prefill proyectado al navegar si el usuario no editó.
    if (!userEditedRef.current) {
      const monday = mondayOf(weekEnd);
      const proj = getProjected(monday);
      if (proj != null) {
        setBalanceStr(formatSigned(proj));
      }
    }
    // Si hay caché, aplicar al instante.
    const cached = cacheRef.current.get(weekEnd);
    if (cached) {
      applySnap(cached);
      setLoadingBank(false);
      return;
    }
    setSnap(null);
    debounceRef.current = setTimeout(() => {
      void load(weekEnd);
    }, delay);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snap solo para decidir delay inicial
  }, [open, weekEnd, load, getProjected, applySnap]);

  if (!open) return null;

  const shiftWeek = (dir: -1 | 1) => {
    const base = Date.parse(`${weekEnd}T00:00:00Z`);
    if (Number.isNaN(base)) return;
    userEditedRef.current = false;
    setWeekEnd(new Date(base + dir * 7 * 86_400_000).toISOString().slice(0, 10));
  };

  const monday = snap?.weekStartYmd ?? mondayOf(weekEnd);
  const sunday = snap?.weekEndYmd ?? weekEnd;
  const label = snap?.weekLabel ?? "";
  const closedBalance = parseSignedAmount(balanceStr || "0");
  const bankSuggested = snap?.bankBalanceClp;
  const projected = getProjected(monday) ?? snap?.projectedBalanceClp ?? 0;
  const variance = closedBalance - projected;
  const differsFromBank =
    bankSuggested != null ? Math.abs(closedBalance - bankSuggested) > 1 : false;
  const needsReason = differsFromBank;
  const reasonOk = !needsReason || manualReason.trim().length >= 5;
  const alreadyClosed = snap?.alreadyClosed ?? false;
  const isFuture = snap?.isFuture ?? monday > mondayOf(new Date().toISOString().slice(0, 10));

  const varianceTone =
    variance === 0
      ? "text-status-ok-fg"
      : Math.abs(variance) < 1_000_000
        ? "text-status-warn-fg"
        : "text-status-danger-fg";

  const confirm = async () => {
    const r = await onConfirm({
      weekEnd: sunday,
      closedBalance,
      notes: notes.trim() || undefined,
      manualReason: needsReason ? manualReason.trim() : undefined,
    });
    if (r.ok) {
      cacheRef.current.clear();
      onClose();
    } else setError(r.reason);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-auto max-lg:max-h-[90vh] max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-t-2xl max-lg:rounded-b-none max-lg:overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cerrar semana</DialogTitle>
        </DialogHeader>

        <div className="mb-2 flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => shiftWeek(-1)} aria-label="Semana anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-mono text-[13px] uppercase tracking-wide text-ds-text-2">
            {label ? `${label} · ${monday} → ${sunday}` : `${monday} → ${sunday}`}
          </span>
          <Button variant="outline" size="sm" onClick={() => shiftWeek(1)} aria-label="Semana siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {error && (
          <div className="mb-2 rounded border border-status-danger-border bg-status-danger-soft/40 px-2 py-2 text-sm text-status-danger-fg">
            {error}
          </div>
        )}

        {alreadyClosed ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded border border-ds-border-default bg-ds-surface-2 px-2 py-2 text-sm text-ds-text-2">
              <Lock className="h-4 w-4 shrink-0 text-ds-text-3" />
              Esta semana ya está cerrada (sellada).
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cerrar</Button>
              <Button
                variant="destructive"
                disabled={busy || !snap}
                onClick={() => snap && onReopen(snap.weekEndYmd)}
              >
                {busy ? "Reabriendo…" : "Reabrir semana"}
              </Button>
            </DialogFooter>
          </div>
        ) : isFuture && snap ? (
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
              <span className="inline-flex items-center gap-1.5">
                Saldo de cierre (sugerido: banco{" "}
                {loadingBank || bankSuggested == null ? (
                  <span
                    aria-busy
                    className="inline-block h-3.5 w-16 animate-pulse rounded bg-ds-surface-3"
                  />
                ) : (
                  fmtClp(bankSuggested)
                )}
                )
              </span>
              <Input
                inputMode="numeric"
                value={balanceStr}
                onChange={(e) => {
                  userEditedRef.current = true;
                  const raw = e.target.value;
                  const neg = raw.trim().startsWith("-") ? "-" : "";
                  setBalanceStr(neg + formatThousands(raw));
                }}
              />
            </label>

            <div className="flex gap-3 text-xs text-ds-text-3">
              <span>
                Sin asignar:{" "}
                <span className="text-ds-text-1">
                  {snap ? snap.unassignedBankCount : loadingBank ? "…" : "—"}
                </span>
              </span>
              <span>
                Proy. no cumplidas:{" "}
                <span className="text-ds-text-1">
                  {snap ? snap.unfulfilledProjCount : loadingBank ? "…" : "—"}
                </span>
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
