"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { formatThousands, parseSignedAmount, fmtClp } from "./format";
import { UF_POLICY_LABELS, type UfPolicy } from "@/modules/finance/flow-v3/uf-occurrence";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-sm text-ds-text-1";

const FREQ_LABELS: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal (cada 2 semanas)",
  MONTHLY: "Mensual (día N)",
};

const UF_OPTS = (["RUN_DAY", "LAST_DAY_MONTH", "LAST_DAY_PREV_MONTH", "CUSTOM_DAY"] as UfPolicy[]);

/** Egreso recurrente de plan (§5J / v4 UF) sobre una fila de egreso existente. */
export function RecurringExpenseDialog({
  row, busy, onConfirm, onClose, ufToday,
}: {
  row: FlowMatrixRowDto | null;
  busy: boolean;
  onConfirm: (body: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
  /** Valor UF de hoy para preview (opcional). */
  ufToday?: number | null;
}) {
  const [currency, setCurrency] = useState<"CLP" | "UF">("CLP");
  const [amountStr, setAmountStr] = useState("");
  const [amountUfStr, setAmountUfStr] = useState("");
  const [ufPolicy, setUfPolicy] = useState<UfPolicy>("LAST_DAY_MONTH");
  const [ufCustomDay, setUfCustomDay] = useState("1");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    if (!row) return;
    setCurrency("CLP");
    setAmountStr("");
    setAmountUfStr("");
    setUfPolicy("LAST_DAY_MONTH");
    setUfCustomDay("1");
    setFrequency("MONTHLY");
    setDayOfMonth("1");
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate("");
  }, [row]);

  if (!row) return null;
  const amount = Math.abs(parseSignedAmount(amountStr || "0"));
  const amountUf = Number(String(amountUfStr).replace(",", "."));
  const dom = Number(dayOfMonth);
  const validDom = frequency !== "MONTHLY" || (Number.isInteger(dom) && dom >= 1 && dom <= 31);
  const validDates = !!startDate && (!endDate || endDate >= startDate);
  const amountOk = currency === "UF" ? Number.isFinite(amountUf) && amountUf > 0 : amount > 0;
  const canSubmit = amountOk && validDom && validDates && !busy;
  const previewClp =
    currency === "UF" && ufToday != null && Number.isFinite(amountUf)
      ? Math.round(amountUf * ufToday)
      : null;

  const submit = async () => {
    const body: Record<string, unknown> = {
      rowId: row.id,
      frequency,
      startDate,
      currency,
      ...(frequency === "MONTHLY" ? { dayOfMonth: dom } : {}),
      ...(endDate ? { endDate } : {}),
    };
    if (currency === "UF") {
      body.amountUf = amountUf;
      body.ufPolicy = ufPolicy;
      if (ufPolicy === "CUSTOM_DAY") body.ufCustomDay = Number(ufCustomDay) || 1;
      body.amount = previewClp ?? 0;
    } else {
      body.amount = amount;
    }
    const r = await onConfirm(body);
    if (r != null) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-auto max-lg:max-h-[90vh] max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-t-2xl max-lg:rounded-b-none">
        <DialogHeader>
          <DialogTitle>Egreso recurrente · «{row.name}»</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="inline-flex h-9 overflow-hidden rounded-full border border-ds-border-default bg-ds-surface-2 p-0.5">
            {(["CLP", "UF"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`min-h-8 min-w-14 rounded-full px-3 text-[13px] font-medium ${
                  currency === c ? "bg-primary text-primary-foreground" : "text-ds-text-3"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {currency === "CLP" ? (
            <label className="block space-y-1 text-xs text-ds-text-3">
              <span>Monto por ocurrencia (CLP)</span>
              <Input
                inputMode="numeric"
                value={amountStr}
                onChange={(e) => setAmountStr(formatThousands(e.target.value))}
                placeholder="1.500.000"
              />
            </label>
          ) : (
            <>
              <label className="block space-y-1 text-xs text-ds-text-3">
                <span>Monto por ocurrencia (UF)</span>
                <Input
                  inputMode="decimal"
                  value={amountUfStr}
                  onChange={(e) => setAmountUfStr(e.target.value)}
                  placeholder="24,5"
                />
              </label>
              <label className="block space-y-1 text-xs text-ds-text-3">
                <span>Valor UF a usar</span>
                <select
                  className={SELECT_CLASS}
                  value={ufPolicy}
                  onChange={(e) => setUfPolicy(e.target.value as UfPolicy)}
                >
                  {UF_OPTS.map((k) => (
                    <option key={k} value={k}>{UF_POLICY_LABELS[k]}</option>
                  ))}
                </select>
              </label>
              {ufPolicy === "CUSTOM_DAY" && (
                <label className="block space-y-1 text-xs text-ds-text-3">
                  <span>Día fijo (1–31)</span>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={ufCustomDay}
                    onChange={(e) => setUfCustomDay(e.target.value)}
                  />
                </label>
              )}
              {previewClp != null && (
                <p className="text-[12px] text-ds-text-3">
                  ≈ {fmtClp(previewClp)}{" "}
                  <span className="text-ds-text-4">
                    (UF hoy {ufToday!.toLocaleString("es-CL")} · estimado)
                  </span>
                </p>
              )}
            </>
          )}

          <label className="block space-y-1 text-xs text-ds-text-3">
            <span>Periodicidad</span>
            <select className={SELECT_CLASS} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              {Object.entries(FREQ_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          {frequency === "MONTHLY" && (
            <label className="block space-y-1 text-xs text-ds-text-3">
              <span>Día del mes (1–31; se ajusta al último día en meses cortos)</span>
              <Input type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1 text-xs text-ds-text-3">
              <span>Inicio</span>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="block space-y-1 text-xs text-ds-text-3">
              <span>Término (opcional)</span>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>
          <p className="rounded border border-status-warn-border bg-status-warn-soft/40 px-2 py-1.5 text-xs text-status-warn-fg">
            Materializa celdas de plan hacia adelante hasta el término (o 12 meses). En UF se
            recalcula el CLP al cambiar el valor; nunca toca semanas selladas ni el pasado.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {busy ? "Creando…" : "Crear recurrente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
