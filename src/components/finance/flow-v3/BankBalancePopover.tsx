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
 * anclar el saldo real mid-week (snapshot MANUAL). El motor de la planilla
 * usa banco hoy + pendientes de la semana para el saldo de fin de semana.
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
        const seed = first ? Math.round(first.currentBalance) : Math.round(detail.totalClp);
        setDraft(seed === 0 ? "" : formatThousands(String(Math.abs(seed))));
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
        throw new Error(j?.error || "No se pudo guardar el saldo");
      }
      toast.success("Saldo banco actualizado", {
        description: "La planilla recalcula con banco hoy + pendientes de la semana.",
      });
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
            {canManage ? "Actualizar saldo banco" : "Saldo del banco hoy"}
          </DialogTitle>
          <DialogDescription className="text-[12px] text-ds-text-3">
            {canManage
              ? `Punto en el tiempo · ${todayLabel} · no cierra la semana`
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
                return (
                  <li
                    key={i}
                    className="flex items-start justify-between gap-2 border-b border-ds-border-subtle pb-1.5 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ds-text-1">{a.bankName}</p>
                      <p className="font-mono text-[12px] uppercase tracking-tight text-ds-text-4">
                        {a.accountMasked}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular-nums text-sm text-ds-text-1">{fmtClp(a.balanceClp)}</p>
                      <p
                        className={`text-[12px] ${stale ? "text-status-warn-fg" : "text-ds-text-4"}`}
                        title={
                          stale
                            ? `Última cartola hace ${d} días — el saldo puede estar desactualizado.`
                            : undefined
                        }
                      >
                        {a.lastSnapshotYmd ? `cartola ${fmtShortDate(a.lastSnapshotYmd)}` : "sin cartola"}
                      </p>
                    </div>
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
                      const acc = accounts.find((a) => a.bankAccountId === id);
                      if (acc) {
                        const seed = Math.round(acc.currentBalance);
                        setDraft(seed === 0 ? "" : formatThousands(String(Math.abs(seed))));
                      }
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
                      <span className="text-ds-text-3">Diferencia vs FC</span>
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
                      Nota (opcional)
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
                    Guarda un snapshot a hoy. El saldo de fin de semana queda como{" "}
                    <span className="text-ds-text-2">banco hoy + pendientes</span>{" "}
                    (quincena, Previred, IVA, etc. siguen hasta conciliarlos).
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
              disabled={saving || parsed == null || !selectedId || loading}
            >
              {saving ? "Guardando…" : "Anclar y recalcular"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
