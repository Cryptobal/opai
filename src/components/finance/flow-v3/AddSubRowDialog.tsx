"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DatePickerField } from "@/components/ui/date-picker";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { UF_POLICY_LABELS, type UfPolicy } from "@/modules/finance/flow-v3/uf-occurrence";
import { formatThousands, parseSignedAmount, fmtClp } from "./format";
import type { PlanRecurrenceDto } from "./RecurringExpenseDialog";
import { rowDeleteBlockReason } from "./menu-builders";

const SELECT_CLASS =
  "h-10 sm:h-9 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1";

const FREQ_LABELS: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal (cada 2 semanas)",
  MONTHLY: "Mensual (día N)",
};

const UF_OPTS = (["RUN_DAY", "LAST_DAY_MONTH", "LAST_DAY_PREV_MONTH", "CUSTOM_DAY"] as UfPolicy[]);
const NEW_CHILD = "__new__";

type AmountMode = "CLP" | "UF";
type TermMode = "date" | "occurrences" | "both";

function applyRuleToFormSetters(
  rule: PlanRecurrenceDto,
  set: {
    amountMode: (v: AmountMode) => void;
    amountStr: (v: string) => void;
    amountUfStr: (v: string) => void;
    ufPolicy: (v: UfPolicy) => void;
    ufCustomDay: (v: string) => void;
    frequency: (v: string) => void;
    dayOfMonth: (v: string) => void;
    startDate: (v: string) => void;
    termMode: (v: TermMode) => void;
    endDate: (v: string) => void;
    endAfterOccurrences: (v: string) => void;
  },
) {
  if (rule.currency === "UF") {
    set.amountMode("UF");
    set.amountUfStr(String(rule.amountUf ?? ""));
    set.amountStr("");
    set.ufPolicy((rule.ufPolicy as UfPolicy) || "LAST_DAY_MONTH");
    set.ufCustomDay(String(rule.ufCustomDay ?? 1));
  } else {
    set.amountMode("CLP");
    set.amountStr(formatThousands(String(Math.abs(rule.amount))));
    set.amountUfStr("");
  }
  set.frequency(rule.frequency);
  set.dayOfMonth(String(rule.dayOfMonth ?? 1));
  set.startDate(rule.startDate);
  if (rule.endDate && rule.endAfterOccurrences) {
    set.termMode("both");
    set.endDate(rule.endDate);
    set.endAfterOccurrences(String(rule.endAfterOccurrences));
  } else if (rule.endAfterOccurrences) {
    set.termMode("occurrences");
    set.endDate("");
    set.endAfterOccurrences(String(rule.endAfterOccurrences));
  } else {
    set.termMode("date");
    set.endDate(rule.endDate ?? "");
    set.endAfterOccurrences("12");
  }
}

export function AddSubRowDialog({
  parent,
  children = [],
  initialChildId = null,
  busy,
  ufToday,
  onConfirm,
  onUpdate,
  onDelete,
  onClose,
}: {
  parent: FlowMatrixRowDto | null;
  children?: FlowMatrixRowDto[];
  initialChildId?: string | null;
  busy: boolean;
  ufToday?: number | null;
  onConfirm: (body: Record<string, unknown>) => Promise<unknown>;
  onUpdate?: (childId: string, body: Record<string, unknown>) => Promise<unknown>;
  onDelete?: (childId: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const isOpen = parent != null;
  const [selectedChildId, setSelectedChildId] = useState<string>(NEW_CHILD);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loadingRules, setLoadingRules] = useState(false);

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

  const resetCreateForm = useCallback((nameHint = "") => {
    setName(nameHint);
    setAmountMode("CLP");
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
    setRut("");
    setDescription("");
    setConfirmDelete(false);
  }, []);

  const formSetters = useMemo(
    () => ({
      amountMode: setAmountMode,
      amountStr: setAmountStr,
      amountUfStr: setAmountUfStr,
      ufPolicy: setUfPolicy,
      ufCustomDay: setUfCustomDay,
      frequency: setFrequency,
      dayOfMonth: setDayOfMonth,
      startDate: setStartDate,
      termMode: setTermMode,
      endDate: setEndDate,
      endAfterOccurrences: setEndAfterOccurrences,
    }),
    [],
  );

  useEffect(() => {
    if (!isOpen) return;
    const startId = initialChildId && children.some((c) => c.id === initialChildId)
      ? initialChildId
      : NEW_CHILD;
    setSelectedChildId(startId);
    const child = children.find((c) => c.id === startId);
    resetCreateForm(child?.name ?? "");
    // children se lee al abrir; no resetear en cada refetch de la matriz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, parent?.id, initialChildId, resetCreateForm]);

  useEffect(() => {
    if (!isOpen || selectedChildId === NEW_CHILD) {
      setLoadingRules(false);
      return;
    }
    let cancelled = false;
    setLoadingRules(true);
    setConfirmDelete(false);
    fetch(`/api/finance/flow-v3/recurring-plan?rowId=${encodeURIComponent(selectedChildId)}`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((json: { success?: boolean; data?: PlanRecurrenceDto[] }) => {
        if (cancelled) return;
        const rules = json.success && Array.isArray(json.data) ? json.data : [];
        if (rules[0]) applyRuleToFormSetters(rules[0], formSetters);
      })
      .catch(() => { /* formulario queda con el nombre */ })
      .finally(() => {
        if (!cancelled) setLoadingRules(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedChildId, formSetters]);

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

  const isEditing = selectedChildId !== NEW_CHILD;
  const editingChild = children.find((c) => c.id === selectedChildId) ?? null;
  const deleteReason = editingChild ? rowDeleteBlockReason(editingChild) : null;

  if (!parent) return null;

  const buildBody = (): Record<string, unknown> => {
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
    return {
      name: name.trim(),
      recurrence,
      ...(Object.keys(matchRule).length > 0 ? { matchRule } : {}),
    };
  };

  const submit = async () => {
    if (isEditing) {
      if (!onUpdate) return;
      const r = await onUpdate(selectedChildId, buildBody());
      if (r != null) onClose();
      return;
    }
    const r = await onConfirm({
      parentId: parent.id,
      section: parent.section,
      mapping: "MANUAL",
      ...buildBody(),
    });
    if (r != null) onClose();
  };

  const handleDelete = async () => {
    if (!onDelete || !isEditing) return;
    const r = await onDelete(selectedChildId);
    if (r != null) onClose();
  };

  const selectChild = (id: string) => {
    setSelectedChildId(id);
    const child = children.find((c) => c.id === id);
    resetCreateForm(child?.name ?? "");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-auto max-lg:max-h-[90vh] max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-t-2xl max-lg:rounded-b-none">
        <DialogHeader>
          <DialogTitle>Subfilas de «{parent.name}»</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-xs text-ds-text-3">
            <span>Subfila</span>
            <select
              data-testid="subrow-selector"
              className={SELECT_CLASS}
              value={selectedChildId}
              onChange={(e) => selectChild(e.target.value)}
            >
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.isArchived ? " (archivada)" : ""}
                </option>
              ))}
              <option value={NEW_CHILD}>
                {children.length > 0 ? "Nueva subfila…" : "Nueva subfila"}
              </option>
            </select>
            {loadingRules && (
              <span className="block text-[12px] text-ds-text-4">Cargando…</span>
            )}
          </label>

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

          {isEditing && confirmDelete && (
            <div className="space-y-2 rounded border border-status-danger-border bg-status-danger-soft/40 p-2">
              <p className="text-[13px] text-status-danger-fg">
                {deleteReason
                  ? deleteReason
                  : "¿Eliminar esta subfila? Se borra su proyección en semanas abiertas. Semanas cerradas y movimientos reales no se tocan."}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-10 sm:h-9"
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                >
                  No
                </Button>
                {!deleteReason && (
                  <Button
                    variant="destructive"
                    className="h-10 sm:h-9"
                    disabled={busy || !onDelete}
                    onClick={() => void handleDelete()}
                  >
                    {busy ? "Eliminando…" : "Sí, eliminar"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex w-full gap-2 sm:w-auto">
            {isEditing && onDelete && !confirmDelete && (
              <Button
                variant="outline"
                className="h-10 sm:h-9 border-status-danger-border text-status-danger-fg"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                Eliminar
              </Button>
            )}
          </div>
          <div className="flex w-full gap-2 sm:w-auto sm:justify-end">
            <Button type="button" variant="ghost" className="h-10 sm:h-9" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button type="button" className="h-10 sm:h-9" onClick={() => void submit()} disabled={!canSubmit}>
              {isEditing ? "Guardar cambios" : "Crear subfila"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
