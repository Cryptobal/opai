"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Landmark } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OpeningBalanceDetail } from "@/modules/finance/flow-v3/matrix-types";
import { fmtClp, fmtShortDate, formatThousands } from "./format";
import {
  bankBalanceSourceLabel,
  DEFAULT_BANK_BALANCE_DISCREPANCY_THRESHOLD_CLP,
} from "@/modules/finance/banking/bank-balance-constants";
import { Tag } from "@/components/opai-ds";

/** Días entre una cartola (YMD) y hoy (YMD). */
function daysSince(ymd: string | null, todayYmd: string): number | null {
  if (!ymd) return null;
  const a = Date.parse(`${ymd}T00:00:00Z`);
  const b = Date.parse(`${todayYmd}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

interface BankAccountOption {
  bankAccountId: string;
  bankName: string;
  accountNumber: string;
  currentBalance: number;
}

function parseClpDigits(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

/**
 * Desglose del saldo bancario de hoy (§5H) +, si `canManage`, formulario para
 * registrar la lectura del banco (saldo real que muestra la app). La lectura
 * se cuadra contra el ledger (saldo inicial + movimientos) y NO lo modifica:
 * "Banco hoy" solo cambia con movimientos. El motor de la planilla usa banco
 * hoy + pendientes de la semana para el saldo de fin de semana.
 */
export function BankBalancePopover({
  open,
  onOpenChange,
  detail,
  todayYmd,
  canManage = false,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  detail: OpeningBalanceDetail;
  todayYmd: string;
  canManage?: boolean;
  onSaved?: () => void | Promise<void>;
}) {
  const [accounts, setAccounts] = useState<BankAccountOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !canManage) return;
    let cancelled = false;
    setLoadError(null);
    setNote("");
    setLoading(true);
    fetch("/api/finance/cashflow/bank-balance/pull", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok || !j?.success) {
          throw new Error(j?.error || "No se pudieron cargar las cuentas");
        }
        return j.data as BankAccountOption[];
      })
      .then((list) => {
        if (cancelled) return;
        setAccounts(list);
        const first = list[0] ?? null;
        setSelectedId(first?.bankAccountId ?? null);
        // Nunca prellenar con el saldo de OPAI: la lectura es lo que dice el banco.
        setDraft("");
      })
      .catch((err) => {
        if (cancelled) return;
        setAccounts([]);
        setSelectedId(null);
        setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, canManage, detail.totalClp]);

  const selected = accounts.find((a) => a.bankAccountId === selectedId) ?? null;
  const parsed = parseClpDigits(draft);
  const fcBalance = selected?.currentBalance ?? detail.totalClp;
  const delta = parsed != null ? parsed - Math.round(fcBalance) : null;
  const discrepancyThresholdClp =
    detail.discrepancyThresholdClp ??
    DEFAULT_BANK_BALANCE_DISCREPANCY_THRESHOLD_CLP;
  const noteRequired =
    delta != null &&
    Math.abs(delta) >= discrepancyThresholdClp &&
    !note.trim();

  const todayLabel = useMemo(() => fmtShortDate(todayYmd), [todayYmd]);

  async function handleSave() {
    if (!canManage || !selectedId || parsed == null) return;
    setSaving(true);
    try {
      const res = await fetch("/api/finance/cashflow/bank-balance/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankAccountId: selectedId,
          balance: parsed,
          note: note.trim() || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j?.success) {
        const err = j?.error === "note_required"
          ? "La diferencia supera el umbral: agregá una nota"
          : j?.error || "No se pudo registrar la lectura";
        throw new Error(err);
      }
      const d = j.data as {
        balance: number;
        readingBalance: number;
        needsOpening?: boolean;
        discrepancy?: { delta: number; evaluable: boolean };
      };
      const deltaClp = d.discrepancy?.delta ?? 0;
      if (d.needsOpening || d.discrepancy?.evaluable === false) {
        toast.warning("Lectura registrada", {
          description: "La cuenta no tiene saldo inicial: definilo en Bancos → Cuadratura.",
        });
      } else if (Math.abs(deltaClp) < 1) {
        toast.success("Cuadra con el banco", {
          description: `Banco hoy ${fmtClp(d.balance)} coincide con la lectura.`,
        });
      } else {
        toast.warning(`Diferencia ${fmtClp(deltaClp)} con el banco`, {
          description: "Banco hoy no cambia: falta o sobra un movimiento. Revisá Bancos → Cuadratura.",
        });
      }
      await onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0 sm:max-w-md">
        <DialogHeader className="space-y-1 border-b border-ds-border-subtle px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base text-ds-text-1">
            <Landmark className="h-4 w-4 text-ds-text-3" aria-hidden />
            {canManage ? "Cuadrar saldo banco" : "Saldo del banco hoy"}
          </DialogTitle>
          <DialogDescription className="text-[12px] text-ds-text-3">
            {canManage
              ? `Lectura del banco · ${todayLabel} · no modifica el saldo ni cierra la semana`
              : "Desglose por cuenta (solo lectura)"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <ul className="space-y-2">
            {detail.perAccount.length === 0 ? (
              <li className="text-sm text-ds-text-4">No hay cuentas bancarias activas.</li>
            ) : (
              detail.perAccount.map((a, i) => {
                const d = daysSince(a.lastSnapshotYmd, todayYmd);
                const stale = d != null && d > 7;
                const disc = a.lastDiscrepancy;
                const warnDisc =
                  disc != null &&
                  Math.abs(disc.deltaClp) >= discrepancyThresholdClp;
                return (
                  <li
                    key={i}
                    className="flex flex-col gap-1 border-b border-ds-border-subtle pb-2 last:border-0"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ds-text-1">{a.bankName}</p>
                        <p className="font-mono text-[12px] uppercase tracking-tight text-ds-text-4">
                          {a.accountMasked}
                        </p>
                      </div>
                      <p className="shrink-0 tabular-nums text-sm text-ds-text-1">
                        {fmtClp(a.balanceClp)}
                      </p>
                    </div>
                    {a.needsOpening ? (
                      <Tag variant="warn" size="md">
                        Sin saldo inicial: definir en Bancos → Cuadratura
                      </Tag>
                    ) : (
                      <p
                        className={`text-[12px] ${stale ? "text-status-warn-fg" : "text-ds-text-4"}`}
                      >
                        {bankBalanceSourceLabel(a.anchorSource)}{" "}
                        {a.lastSnapshotYmd ? fmtShortDate(a.lastSnapshotYmd) : "—"}{" "}
                        {fmtClp(a.anchorBalanceClp)} + {a.txCount} mov. ({fmtClp(a.txDeltaClp)})
                      </p>
                    )}
                    {disc && (
                      <div className="flex items-center gap-1.5">
                        <Tag variant={warnDisc ? "warn" : "neutral"} size="md">
                          Última diferencia no explicada: {fmtClp(disc.deltaClp)} el{" "}
                          {fmtShortDate(disc.asOfYmd)}
                        </Tag>
                      </div>
                    )}
                  </li>
                );
              })
            )}
          </ul>

          <div className="flex items-center justify-between border-t border-ds-border-default pt-2">
            <span className="text-sm font-medium text-ds-text-2">Total en FC</span>
            <span className="tabular-nums text-sm font-semibold text-ds-text-1">
              {fmtClp(detail.totalClp)}
            </span>
          </div>

          {canManage && (
            <div className="space-y-3 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-3">
              {loading && (
                <p className="text-[13px] text-ds-text-3">Cargando cuentas…</p>
              )}
              {loadError && (
                <p className="text-[13px] text-status-warn-fg">{loadError}</p>
              )}
              {!loading && !loadError && accounts.length === 0 && (
                <p className="text-[13px] text-status-warn-fg">
                  No hay cuentas CLP activas. Créalas en Finanzas → Banca.
                </p>
              )}
              {accounts.length > 1 && (
                <div>
                  <label className="mb-1 block text-[12px] text-ds-text-3" htmlFor="fc-bank-acct">
                    Cuenta
                  </label>
                  <select
                    id="fc-bank-acct"
                    value={selectedId ?? ""}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedId(id);
                      setDraft("");
                    }}
                    className="h-10 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-3 text-sm text-ds-text-1 sm:h-9"
                  >
                    {accounts.map((a) => (
                      <option key={a.bankAccountId} value={a.bankAccountId}>
                        {a.bankName} · {a.accountNumber}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {selected && (
                <>
                  <div>
                    <label className="mb-1 block text-[12px] text-ds-text-3" htmlFor="fc-bank-bal">
                      Saldo real a hoy
                    </label>
                    <Input
                      id="fc-bank-bal"
                      ref={inputRef}
                      inputMode="numeric"
                      enterKeyHint="done"
                      value={draft}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "");
                        setDraft(digits ? formatThousands(digits) : "");
                      }}
                      placeholder="Ej. 39.672.512"
                      className="h-11 font-mono text-base tabular-nums sm:h-10"
                      disabled={saving}
                    />
                  </div>
                  {delta != null && delta !== 0 && (
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-ds-text-3">Diferencia banco − OPAI</span>
                      <span
                        className={`tabular-nums font-medium ${
                          delta < 0 ? "text-status-danger-fg" : "text-status-ok-fg"
                        }`}
                      >
                        {delta > 0 ? "+" : ""}
                        {fmtClp(delta)}
                      </span>
                    </div>
                  )}
                  <div>
                    <label className="mb-1 block text-[12px] text-ds-text-3" htmlFor="fc-bank-note">
                      {noteRequired ? "Nota (obligatoria)" : "Nota (opcional)"}
                    </label>
                    <Input
                      id="fc-bank-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Ej. App Office Banking 12:51"
                      className="h-10 text-sm sm:h-9"
                      maxLength={500}
                      disabled={saving}
                    />
                  </div>
                  <p className="text-[12px] leading-snug text-ds-text-3">
                    Registra lo que muestra el banco y lo compara con Banco hoy
                    (saldo inicial + movimientos). Si difieren, falta o sobra un
                    movimiento: se resuelve en Bancos → Cuadratura, nunca moviendo
                    el saldo. El fin de semana queda como{" "}
                    <span className="text-ds-text-2">banco hoy + pendientes</span>.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {canManage && (
          <div className="flex gap-2 border-t border-ds-border-subtle px-5 py-3">
            <Button
              type="button"
              variant="ghost"
              className="h-10 flex-1 sm:h-9"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="h-10 flex-1 sm:h-9"
              onClick={() => void handleSave()}
              disabled={saving || parsed == null || !selectedId || loading || noteRequired}
            >
              {saving ? "Guardando…" : "Registrar lectura"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
