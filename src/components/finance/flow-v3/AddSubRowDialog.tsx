"use client";

import { useMemo, useState } from "react";
import { DatePickerField } from "@/components/ui/date-picker";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { UF_POLICY_LABELS, type UfPolicy } from "@/modules/finance/flow-v3/uf-occurrence";
import { formatThousands, parseSignedAmount, fmtClp } from "./format";

const SELECT_CLASS =
  "h-10 sm:h-9 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1";

const FREQ_LABELS: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal (cada 2 semanas)",
  MONTHLY: "Mensual (día N)",
};

const UF_OPTS = (["RUN_DAY", "LAST_DAY_MONTH", "LAST_DAY_PREV_MONTH", "CUSTOM_DAY"] as UfPolicy[]);

type AmountMode = "CLP" | "UF";
type TermMode = "date" | "occurrences" | "both";

export function AddSubRowDialog({
  parent,
  busy,
  ufToday,
  onConfirm,
  onClose,
}: {
  parent: FlowMatrixRowDto | null;
  busy: boolean;
  ufToday?: number | null;
  onConfirm: (body: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [amountMode, setAmountMode] = useState<AmountMode>("CLP");
  const [amountStr, setAmountStr] = useState("");
  const [amountUfStr, setAmountUfStr] = useState("");
  const [ufPolicy, setUfPolicy] = useState<UfPolicy>("LAST_DAY_MONTH");
  const [ufCustomDay, setUfCustomDay] = useState("1");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [termMode, setTermMode] = useState<TermMode>("date");
  const [endDate, setEndDate] = useState("");
  const [endAfterOccurrences, setEndAfterOccurrences] = useState("12");
  const [rut, setRut] = useState("");
  const [description, setDescription] = useState("");

  const amountMag = Math.abs(parseSignedAmount(amountStr || "0"));
  const amountUfMag = Math.abs(Number(String(amountUfStr).replace(",", ".")));
  const dom = Number(dayOfMonth);
  const validDom = frequency !== "MONTHLY" || (Number.isInteger(dom) && dom >= 1 && dom <= 31);
  const nOcc = Number(endAfterOccurrences);
  const validOcc =
    termMode !== "occurrences" && termMode !== "both"
    || (Number.isInteger(nOcc) && nOcc >= 1);
  const validDates = !!startDate && (termMode !== "date" && termMode !== "both" || !endDate || endDate >= startDate);
  const amountOk = amountMode === "UF"
    ? Number.isFinite(amountUfMag) && amountUfMag > 0
    : amountMag > 0;
  const canSubmit = name.trim().length > 0 && amountOk && validDom && validDates && validOcc && !busy;

  const previewClp = useMemo(() => {
    if (amountMode !== "UF" || ufToday == null || !Number.isFinite(amountUfMag)) return null;
    return Math.round(amountUfMag * ufToday);
  }, [amountMode, ufToday, amountUfMag]);

  if (!parent) return null;

  const submit = async () => {
    const recurrence: Record<string, unknown> = {
      frequency,
      startDate,
      ...(frequency === "MONTHLY" ? { dayOfMonth: dom } : {}),
      endDate: termMode === "date" || termMode === "both" ? (endDate || null) : null,
      endAfterOccurrences:
        termMode === "occurrences" || termMode === "both" ? nOcc : null,
    };
    if (amountMode === "UF") {
      recurrence.currency = "UF";
      recurrence.amountUf = amountUfMag;
      recurrence.ufPolicy = ufPolicy;
      if (ufPolicy === "CUSTOM_DAY") recurrence.ufCustomDay = Number(ufCustomDay) || 1;
      recurrence.amount = previewClp ?? amountUfMag;
    } else {
      recurrence.currency = "CLP";
      recurrence.amount = amountMag;
    }
    const matchRule: Record<string, string> = {};
    if (rut.trim()) matchRule.rut = rut.trim();
    if (description.trim().length >= 4) matchRule.description = description.trim();

    const r = await onConfirm({
      parentId: parent.id,
      name: name.trim(),
      section: parent.section,
      mapping: "MANUAL",
      recurrence,
      ...(Object.keys(matchRule).length > 0 ? { matchRule } : {}),
    });
    if (r != null) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-auto max-lg:max-h-[90vh] max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-t-2xl max-lg:rounded-b-none">
        <DialogHeader>
          <DialogTitle>Subfila de «{parent.name}»</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-xs text-ds-text-3">
            <span>Nombre</span>
            <Input
              className="h-10 sm:h-9"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Contador"
            />
          </label>

          <div className="inline-flex h-10 sm:h-9 overflow-hidden rounded-full border border-ds-border-default bg-ds-surface-2 p-0.5">
            {(["CLP", "UF"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setAmountMode(key)}
                className={`min-h-9 min-w-[4.5rem] rounded-full px-3 text-[13px] font-medium ${
                  amountMode === key ? "bg-primary text-primary-foreground" : "text-ds-text-3"
                }`}
              >
                {key}
              </button>
            ))}
          </div>

          {amountMode === "CLP" ? (
            <label className="block space-y-1 text-xs text-ds-text-3">
              <span>Monto recurrente (CLP)</span>
              <Input
                className="h-10 sm:h-9"
                inputMode="numeric"
                value={amountStr}
                onChange={(e) => setAmountStr(formatThousands(e.target.value))}
                placeholder="1.500.000"
              />
            </label>
          ) : (
            <>
              <label className="block space-y-1 text-xs text-ds-text-3">
                <span>Monto recurrente (UF)</span>
                <Input
                  className="h-10 sm:h-9"
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
                    className="h-10 sm:h-9"
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
            <select
              className={SELECT_CLASS}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            >
              {Object.entries(FREQ_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          {frequency === "MONTHLY" && (
            <label className="block space-y-1 text-xs text-ds-text-3">
              <span>Día del mes</span>
              <Input
                className="h-10 sm:h-9"
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
              />
            </label>
          )}

          <label className="block space-y-1 text-xs text-ds-text-3">
            <span>Inicio</span>
            <DatePickerField
              value={startDate || null}
              onChange={(ymd) => setStartDate(ymd ?? "")}
              triggerClassName="h-10 sm:h-9"
            />
          </label>

          <div className="space-y-2">
            <span className="text-xs text-ds-text-3">Término</span>
            <div className="inline-flex h-10 sm:h-9 overflow-hidden rounded-full border border-ds-border-default bg-ds-surface-2 p-0.5">
              {([
                { key: "date" as const, label: "Fecha" },
                { key: "occurrences" as const, label: "N veces" },
                { key: "both" as const, label: "Ambos" },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTermMode(key)}
                  className={`min-h-9 rounded-full px-2.5 text-[12px] font-medium ${
                    termMode === key ? "bg-primary text-primary-foreground" : "text-ds-text-3"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {(termMode === "date" || termMode === "both") && (
              <DatePickerField
                value={endDate || null}
                onChange={(ymd) => setEndDate(ymd ?? "")}
                triggerClassName="h-10 sm:h-9"
              />
            )}
            {(termMode === "occurrences" || termMode === "both") && (
              <Input
                className="h-10 sm:h-9"
                type="number"
                min={1}
                value={endAfterOccurrences}
                onChange={(e) => setEndAfterOccurrences(e.target.value)}
              />
            )}
          </div>

          <div className="space-y-2 rounded-md border border-ds-border-subtle bg-ds-surface-2 p-2">
            <p className="text-[12px] text-ds-text-3">
              Regla de match (opcional). Cuando el banco calza, la programación se ve pagada.
            </p>
            <label className="block space-y-1 text-xs text-ds-text-3">
              <span>RUT del proveedor</span>
              <Input
                className="h-10 sm:h-9"
                value={rut}
                onChange={(e) => setRut(e.target.value)}
                placeholder="12.345.678-5"
              />
            </label>
            <label className="block space-y-1 text-xs text-ds-text-3">
              <span>Glosa / descripción</span>
              <Input
                className="h-10 sm:h-9"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej. CONTADOR SPA"
              />
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!canSubmit}>
            Crear subfila
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
