"use client";

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { formatThousands, parseSignedAmount } from "./format";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-sm text-ds-text-1";

const FREQ_LABELS: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal (cada 2 semanas)",
  MONTHLY: "Mensual (día N)",
};

/** Egreso recurrente de plan (§5J) sobre una fila de egreso existente. Al guardar
 *  se materializan celdas de plan hacia adelante (sobrescribe solo futuras). */
export function RecurringExpenseDialog({
  row, busy, onConfirm, onClose,
}: {
  row: FlowMatrixRowDto | null;
  busy: boolean;
  onConfirm: (body: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
}) {
  const [amountStr, setAmountStr] = useState("");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    if (!row) return;
    setAmountStr("");
    setFrequency("MONTHLY");
    setDayOfMonth("1");
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate("");
  }, [row]);

  if (!row) return null;
  const amount = Math.abs(parseSignedAmount(amountStr || "0"));
  const dom = Number(dayOfMonth);
  const validDom = frequency !== "MONTHLY" || (Number.isInteger(dom) && dom >= 1 && dom <= 31);
  const validDates = !!startDate && (!endDate || endDate >= startDate);
  const canSubmit = amount > 0 && validDom && validDates && !busy;

  const submit = async () => {
    const body: Record<string, unknown> = {
      rowId: row.id,
      amount,
      frequency,
      startDate,
      ...(frequency === "MONTHLY" ? { dayOfMonth: dom } : {}),
      ...(endDate ? { endDate } : {}),
    };
    const r = await onConfirm(body);
    if (r != null) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Egreso recurrente · «{row.name}»</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-xs text-ds-text-3">
            <span>Monto por ocurrencia (CLP)</span>
            <Input
              inputMode="numeric"
              value={amountStr}
              onChange={(e) => setAmountStr(formatThousands(e.target.value))}
              placeholder="1.500.000"
            />
          </label>
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
            Materializa celdas de plan hacia adelante hasta el término (o 12 meses). Sobrescribe el
            plan futuro existente de esta fila en esas semanas; nunca toca el pasado.
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
