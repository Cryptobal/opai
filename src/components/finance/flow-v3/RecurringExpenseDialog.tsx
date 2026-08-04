"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { formatThousands, parseSignedAmount, fmtClp } from "./format";
import { UF_POLICY_LABELS, type UfPolicy } from "@/modules/finance/flow-v3/uf-occurrence";
import { SECTION_LABELS } from "./grid-classes";

const SELECT_CLASS =
  "h-10 sm:h-9 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1";

const PLAN_RECURRENCE_SECTIONS = [
  "REMUNERACIONES", "IMPUESTOS", "GAV", "OTROS", "FINANCIAMIENTO",
] as const;

const FREQ_LABELS: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal (cada 2 semanas)",
  MONTHLY: "Mensual (día N)",
};

const UF_OPTS = (["RUN_DAY", "LAST_DAY_MONTH", "LAST_DAY_PREV_MONTH", "CUSTOM_DAY"] as UfPolicy[]);

type TermMode = "date" | "occurrences" | "both";
type TargetMode = "existing" | "new";

function defaultSection(row: FlowMatrixRowDto | null): string {
  if (row?.section === "FINANCIAMIENTO") return "FINANCIAMIENTO";
  if (row?.section && PLAN_RECURRENCE_SECTIONS.includes(row.section as typeof PLAN_RECURRENCE_SECTIONS[number])) {
    return row.section;
  }
  return "GAV";
}

/** Egreso / recurrencia de plan (v2) sobre fila existente o nueva. */
export function RecurringExpenseDialog({
  row,
  rows,
  categories,
  busy,
  onConfirm,
  onClose,
  ufToday,
}: {
  row: FlowMatrixRowDto | null;
  rows?: FlowMatrixRowDto[];
  categories?: Array<{ id: string; code: string; name: string; kind: string }>;
  busy: boolean;
  onConfirm: (body: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
  ufToday?: number | null;
}) {
  const isOpen = row !== null || rows !== undefined;
  const selectableRows = useMemo(() => {
    const list = rows?.length ? rows : row ? [row] : [];
    return list.filter(
      (r) => PLAN_RECURRENCE_SECTIONS.includes(r.section as typeof PLAN_RECURRENCE_SECTIONS[number])
        && !r.isArchived,
    );
  }, [rows, row]);

  const expenseCategories = useMemo(
    () => (categories ?? []).filter((c) => c.kind === "EXPENSE"),
    [categories],
  );

  const [targetMode, setTargetMode] = useState<TargetMode>("existing");
  const [selectedRowId, setSelectedRowId] = useState("");
  const [newRowName, setNewRowName] = useState("");
  const [newRowCategoryId, setNewRowCategoryId] = useState("");
  const [newRowSection, setNewRowSection] = useState(defaultSection(row));

  const [currency, setCurrency] = useState<"CLP" | "UF">("CLP");
  const [amountStr, setAmountStr] = useState("");
  const [amountUfStr, setAmountUfStr] = useState("");
  const [ufPolicy, setUfPolicy] = useState<UfPolicy>("LAST_DAY_MONTH");
  const [ufCustomDay, setUfCustomDay] = useState("1");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [termMode, setTermMode] = useState<TermMode>("date");
  const [endDate, setEndDate] = useState("");
  const [endAfterOccurrences, setEndAfterOccurrences] = useState("12");
  const [finSign, setFinSign] = useState<"in" | "out">("out");

  useEffect(() => {
    if (!isOpen) return;
    const list = rows?.length ? rows : row ? [row] : [];
    const filtered = list.filter(
      (r) => PLAN_RECURRENCE_SECTIONS.includes(r.section as typeof PLAN_RECURRENCE_SECTIONS[number])
        && !r.isArchived,
    );
    const initialId = row?.id ?? filtered[0]?.id ?? "";
    setTargetMode(initialId ? "existing" : "new");
    setSelectedRowId(initialId);
    setNewRowName("");
    setNewRowCategoryId("");
    setNewRowSection(defaultSection(row));
    setCurrency("CLP");
    setAmountStr("");
    setAmountUfStr("");
    setUfPolicy("LAST_DAY_MONTH");
    setUfCustomDay("1");
    setFrequency("MONTHLY");
    setDayOfMonth("1");
    setStartDate(new Date().toISOString().slice(0, 10));
    setTermMode("date");
    setEndDate("");
    setEndAfterOccurrences("12");
    setFinSign("out");
  }, [isOpen, row, rows]);

  if (!isOpen) return null;

  const selectedRow = selectableRows.find((r) => r.id === selectedRowId) ?? null;
  const targetSection = targetMode === "new" ? newRowSection : (selectedRow?.section ?? newRowSection);
  const isFinanciamiento = targetSection === "FINANCIAMIENTO";

  const amountMag = Math.abs(parseSignedAmount(amountStr || "0"));
  const amountUfMag = Math.abs(Number(String(amountUfStr).replace(",", ".")));
  const dom = Number(dayOfMonth);
  const validDom = frequency !== "MONTHLY" || (Number.isInteger(dom) && dom >= 1 && dom <= 31);
  const validDates = !!startDate && (termMode !== "date" && termMode !== "both" || !endDate || endDate >= startDate);
  const nOcc = Number(endAfterOccurrences);
  const validOcc =
    termMode !== "occurrences" && termMode !== "both"
    || (Number.isInteger(nOcc) && nOcc >= 1);
  const amountOk = currency === "UF"
    ? Number.isFinite(amountUfMag) && amountUfMag > 0
    : amountMag > 0;
  const newRowOk = targetMode !== "new" || newRowName.trim().length > 0;
  const rowOk = targetMode !== "existing" || !!selectedRowId;
  const termOk =
    termMode === "date" ? true
    : termMode === "occurrences" ? validOcc
    : validOcc && (!endDate || endDate >= startDate);
  const canSubmit = amountOk && validDom && validDates && termOk && newRowOk && rowOk && !busy;

  const previewClp =
    currency === "UF" && ufToday != null && Number.isFinite(amountUfMag)
      ? Math.round(amountUfMag * ufToday)
      : null;

  const signedClp = isFinanciamiento
    ? (finSign === "out" ? -amountMag : amountMag)
    : amountMag;
  const signedPreviewClp = previewClp != null
    ? (isFinanciamiento && finSign === "out" ? -previewClp : previewClp)
    : null;

  const titleRowName = targetMode === "existing"
    ? (selectedRow?.name ?? row?.name)
    : (newRowName.trim() || "nueva fila");

  const submit = async () => {
    const body: Record<string, unknown> = {
      frequency,
      startDate,
      currency,
      ...(frequency === "MONTHLY" ? { dayOfMonth: dom } : {}),
    };

    if (targetMode === "new") {
      body.newRow = {
        section: newRowSection,
        name: newRowName.trim(),
        ...(newRowCategoryId ? { categoryId: newRowCategoryId } : {}),
      };
    } else {
      body.rowId = selectedRowId;
    }

    if (termMode === "date" || termMode === "both") {
      if (endDate) body.endDate = endDate;
    }
    if (termMode === "occurrences" || termMode === "both") {
      body.endAfterOccurrences = nOcc;
    }

    if (currency === "UF") {
      body.amountUf = amountUfMag;
      body.ufPolicy = ufPolicy;
      if (ufPolicy === "CUSTOM_DAY") body.ufCustomDay = Number(ufCustomDay) || 1;
      body.amount = signedPreviewClp ?? (isFinanciamiento ? -amountUfMag : amountUfMag);
    } else {
      body.amount = signedClp;
    }

    const r = await onConfirm(body);
    if (r != null) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-auto max-lg:max-h-[90vh] max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-t-2xl max-lg:rounded-b-none">
        <DialogHeader>
          <DialogTitle>
            {isFinanciamiento ? "Recurrencia" : "Egreso recurrente"} · «{titleRowName}»
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-xs text-ds-text-3">
            <span>Fila destino</span>
            <select
              className={SELECT_CLASS}
              value={targetMode === "new" ? "__new__" : selectedRowId}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setTargetMode("new");
                } else {
                  setTargetMode("existing");
                  setSelectedRowId(e.target.value);
                }
              }}
            >
              {selectableRows.map((r) => (
                <option key={r.id} value={r.id}>
                  {SECTION_LABELS[r.section] ?? r.section} · {r.name}
                </option>
              ))}
              <option value="__new__">Nueva fila…</option>
            </select>
          </label>

          {targetMode === "new" && (
            <div className="space-y-2 rounded border border-ds-border-subtle bg-ds-surface-2 p-2">
              <label className="block space-y-1 text-xs text-ds-text-3">
                <span>Sección</span>
                <select
                  className={SELECT_CLASS}
                  value={newRowSection}
                  onChange={(e) => setNewRowSection(e.target.value)}
                >
                  {PLAN_RECURRENCE_SECTIONS.map((s) => (
                    <option key={s} value={s}>{SECTION_LABELS[s] ?? s}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-xs text-ds-text-3">
                <span>Nombre</span>
                <Input
                  className="h-10 sm:h-9"
                  value={newRowName}
                  onChange={(e) => setNewRowName(e.target.value)}
                  placeholder="Ej. Leasing vehículo"
                />
              </label>
              {expenseCategories.length > 0 && (
                <label className="block space-y-1 text-xs text-ds-text-3">
                  <span>Categoría (opcional)</span>
                  <select
                    className={SELECT_CLASS}
                    value={newRowCategoryId}
                    onChange={(e) => setNewRowCategoryId(e.target.value)}
                  >
                    <option value="">Sin categoría (manual)</option>
                    {expenseCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {isFinanciamiento && (
            <div className="space-y-1">
              <span className="text-xs text-ds-text-3">Signo del movimiento</span>
              <div className="inline-flex h-10 sm:h-9 overflow-hidden rounded-full border border-ds-border-default bg-ds-surface-2 p-0.5">
                {([
                  { key: "in" as const, label: "Ingreso (+)" },
                  { key: "out" as const, label: "Egreso (−)" },
                ]).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFinSign(key)}
                    className={`min-h-9 min-w-[7rem] rounded-full px-3 text-[13px] font-medium ${
                      finSign === key ? "bg-primary text-primary-foreground" : "text-ds-text-3"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="inline-flex h-10 sm:h-9 overflow-hidden rounded-full border border-ds-border-default bg-ds-surface-2 p-0.5">
            {(["CLP", "UF"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`min-h-9 min-w-14 rounded-full px-3 text-[13px] font-medium ${
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
                <span>Monto por ocurrencia (UF)</span>
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
                  ≈ {fmtClp(signedPreviewClp ?? previewClp)}{" "}
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
            <Input
              className="h-10 sm:h-9"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>

          <div className="space-y-2">
            <span className="text-xs text-ds-text-3">Término</span>
            <div className="inline-flex h-10 sm:h-9 overflow-hidden rounded-full border border-ds-border-default bg-ds-surface-2 p-0.5">
              {([
                { key: "date" as const, label: "Fecha" },
                { key: "occurrences" as const, label: "Tras N repeticiones" },
                { key: "both" as const, label: "Ambos" },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTermMode(key)}
                  className={`min-h-9 rounded-full px-2.5 text-[12px] font-medium sm:px-3 sm:text-[13px] ${
                    termMode === key ? "bg-primary text-primary-foreground" : "text-ds-text-3"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {(termMode === "date" || termMode === "both") && (
              <label className="block space-y-1 text-xs text-ds-text-3">
                <span>Fecha de término{termMode === "both" ? " (opcional si N es menor)" : ""}</span>
                <Input
                  className="h-10 sm:h-9"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>
            )}
            {(termMode === "occurrences" || termMode === "both") && (
              <label className="block space-y-1 text-xs text-ds-text-3">
                <span>Número de repeticiones</span>
                <Input
                  className="h-10 sm:h-9"
                  type="number"
                  min={1}
                  value={endAfterOccurrences}
                  onChange={(e) => setEndAfterOccurrences(e.target.value)}
                />
              </label>
            )}
          </div>

          <p className="rounded border border-status-warn-border bg-status-warn-soft/40 px-2 py-1.5 text-xs text-status-warn-fg">
            Editar esta recurrencia reescribe celdas futuras no selladas (pisa ajustes manuales futuros).
          </p>
          <p className="text-[12px] text-ds-text-3">
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
