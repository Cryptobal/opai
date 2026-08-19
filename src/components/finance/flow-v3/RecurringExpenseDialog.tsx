"use client";

import { DatePickerField } from "@/components/ui/date-picker";

import { useCallback, useEffect, useMemo, useState } from "react";
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
type AmountMode = "CLP" | "UF" | "PCT_SALES";

/** DTO del GET /api/finance/flow-v3/recurring-plan?rowId=… */
export interface PlanRecurrenceDto {
  id: string;
  rowId: string;
  amount: number;
  currency: "CLP" | "UF";
  amountMode: "FIXED" | "PCT_SALES";
  pctSales: number | null;
  amountUf: number | null;
  ufPolicy: string | null;
  ufCustomDay: number | null;
  frequency: string;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  endAfterOccurrences: number | null;
  note: string | null;
}

function defaultSection(row: FlowMatrixRowDto | null): string {
  if (row?.section === "FINANCIAMIENTO") return "FINANCIAMIENTO";
  if (row?.section && PLAN_RECURRENCE_SECTIONS.includes(row.section as typeof PLAN_RECURRENCE_SECTIONS[number])) {
    return row.section;
  }
  return "GAV";
}

function fmtShortYmd(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}

function recurrenceOptionLabel(r: PlanRecurrenceDto): string {
  const freq = FREQ_LABELS[r.frequency]?.split(" (")[0] ?? r.frequency;
  let amountPart: string;
  if (r.amountMode === "PCT_SALES") {
    amountPart = `${r.pctSales ?? "?"}% ventas`;
  } else if (r.currency === "UF") {
    amountPart = `${r.amountUf ?? "?"} UF`;
  } else {
    amountPart = fmtClp(r.amount);
  }
  const from = fmtShortYmd(r.startDate);
  const term = r.endDate
    ? ` → ${fmtShortYmd(r.endDate)}`
    : r.endAfterOccurrences
      ? ` · ${r.endAfterOccurrences}×`
      : "";
  return `${freq} · ${amountPart} · desde ${from}${term}`;
}

/** Egreso / recurrencia de plan (v2) sobre fila existente o nueva. */
export function RecurringExpenseDialog({
  row,
  rows,
  categories,
  busy,
  onConfirm,
  onUpdate,
  onDelete,
  onClose,
  ufToday,
}: {
  row: FlowMatrixRowDto | null;
  rows?: FlowMatrixRowDto[];
  categories?: Array<{ id: string; code: string; name: string; kind: string }>;
  busy: boolean;
  onConfirm: (body: Record<string, unknown>) => Promise<unknown>;
  onUpdate?: (id: string, body: Record<string, unknown>) => Promise<unknown>;
  onDelete?: (id: string) => Promise<unknown>;
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

  const [existingRules, setExistingRules] = useState<PlanRecurrenceDto[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingRules, setLoadingRules] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [amountMode, setAmountMode] = useState<AmountMode>("CLP");
  const [amountStr, setAmountStr] = useState("");
  const [amountUfStr, setAmountUfStr] = useState("");
  const [pctSalesStr, setPctSalesStr] = useState("10");
  const [ufPolicy, setUfPolicy] = useState<UfPolicy>("LAST_DAY_MONTH");
  const [ufCustomDay, setUfCustomDay] = useState("1");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [termMode, setTermMode] = useState<TermMode>("date");
  const [endDate, setEndDate] = useState("");
  const [endAfterOccurrences, setEndAfterOccurrences] = useState("12");
  const [finSign, setFinSign] = useState<"in" | "out">("out");
  const [note, setNote] = useState("");

  const resetCreateForm = useCallback((sectionHint?: string) => {
    setAmountMode("CLP");
    setAmountStr("");
    setAmountUfStr("");
    setPctSalesStr("10");
    setUfPolicy("LAST_DAY_MONTH");
    setUfCustomDay("1");
    setFrequency("MONTHLY");
    setDayOfMonth("1");
    setStartDate(new Date().toISOString().slice(0, 10));
    setTermMode("date");
    setEndDate("");
    setEndAfterOccurrences("12");
    setFinSign("out");
    setNote("");
    setConfirmDelete(false);
    if (sectionHint) setNewRowSection(sectionHint);
  }, []);

  const applyRuleToForm = useCallback((rule: PlanRecurrenceDto) => {
    if (rule.amountMode === "PCT_SALES") {
      setAmountMode("PCT_SALES");
      setPctSalesStr(String(rule.pctSales ?? 10));
      setAmountStr("");
      setAmountUfStr("");
      setFinSign(rule.amount < 0 ? "out" : rule.amount > 0 ? "in" : "out");
    } else if (rule.currency === "UF") {
      setAmountMode("UF");
      setAmountUfStr(String(rule.amountUf ?? ""));
      setAmountStr("");
      setUfPolicy((rule.ufPolicy as UfPolicy) || "LAST_DAY_MONTH");
      setUfCustomDay(String(rule.ufCustomDay ?? 1));
      setFinSign(rule.amount < 0 ? "out" : "in");
    } else {
      setAmountMode("CLP");
      setAmountStr(formatThousands(String(Math.abs(rule.amount))));
      setAmountUfStr("");
      setFinSign(rule.amount < 0 ? "out" : rule.amount > 0 ? "in" : "out");
    }
    setFrequency(rule.frequency);
    setDayOfMonth(String(rule.dayOfMonth ?? 1));
    setStartDate(rule.startDate);
    if (rule.endDate && rule.endAfterOccurrences) {
      setTermMode("both");
      setEndDate(rule.endDate);
      setEndAfterOccurrences(String(rule.endAfterOccurrences));
    } else if (rule.endAfterOccurrences) {
      setTermMode("occurrences");
      setEndDate("");
      setEndAfterOccurrences(String(rule.endAfterOccurrences));
    } else {
      setTermMode("date");
      setEndDate(rule.endDate ?? "");
      setEndAfterOccurrences("12");
    }
    setNote(rule.note ?? "");
    setConfirmDelete(false);
  }, []);

  // Reset al abrir / cambiar fila inicial.
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
    setExistingRules([]);
    setEditingId(null);
    resetCreateForm(defaultSection(row));
  }, [isOpen, row, rows, resetCreateForm]);

  // Carga reglas de la fila seleccionada.
  useEffect(() => {
    if (!isOpen || targetMode !== "existing" || !selectedRowId) {
      setExistingRules([]);
      setEditingId(null);
      return;
    }
    let cancelled = false;
    setLoadingRules(true);
    setConfirmDelete(false);
    fetch(`/api/finance/flow-v3/recurring-plan?rowId=${encodeURIComponent(selectedRowId)}`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((json: { success?: boolean; data?: PlanRecurrenceDto[] }) => {
        if (cancelled) return;
        const rules = json.success && Array.isArray(json.data) ? json.data : [];
        setExistingRules(rules);
        if (rules.length > 0) {
          const first = rules[0]!;
          setEditingId(first.id);
          applyRuleToForm(first);
        } else {
          setEditingId(null);
          resetCreateForm();
        }
      })
      .catch(() => {
        if (cancelled) return;
        setExistingRules([]);
        setEditingId(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingRules(false);
      });
    return () => { cancelled = true; };
  }, [isOpen, targetMode, selectedRowId, applyRuleToForm, resetCreateForm]);

  if (!isOpen) return null;

  const selectedRow = selectableRows.find((r) => r.id === selectedRowId) ?? null;
  const targetSection = targetMode === "new" ? newRowSection : (selectedRow?.section ?? newRowSection);
  const isFinanciamiento = targetSection === "FINANCIAMIENTO";
  const isEditing = editingId != null;

  const amountMag = Math.abs(parseSignedAmount(amountStr || "0"));
  const amountUfMag = Math.abs(Number(String(amountUfStr).replace(",", ".")));
  const pctSales = Number(String(pctSalesStr).replace(",", "."));
  const effectiveFrequency = amountMode === "PCT_SALES" ? "MONTHLY" : frequency;
  const dom = Number(dayOfMonth);
  const validDom = effectiveFrequency !== "MONTHLY" || (Number.isInteger(dom) && dom >= 1 && dom <= 31);
  const validDates = !!startDate && (termMode !== "date" && termMode !== "both" || !endDate || endDate >= startDate);
  const nOcc = Number(endAfterOccurrences);
  const validOcc =
    termMode !== "occurrences" && termMode !== "both"
    || (Number.isInteger(nOcc) && nOcc >= 1);
  const amountOk = amountMode === "PCT_SALES"
    ? Number.isFinite(pctSales) && pctSales > 0 && pctSales <= 100
    : amountMode === "UF"
      ? Number.isFinite(amountUfMag) && amountUfMag > 0
      : amountMag > 0;
  const newRowOk = targetMode !== "new" || newRowName.trim().length > 0;
  const rowOk = targetMode !== "existing" || !!selectedRowId;
  const termOk =
    termMode === "date" ? true
    : termMode === "occurrences" ? validOcc
    : validOcc && (!endDate || endDate >= startDate);
  const canSubmit = amountOk && validDom && validDates && termOk && newRowOk && rowOk && !busy && !loadingRules;

  const previewClp =
    amountMode === "UF" && ufToday != null && Number.isFinite(amountUfMag)
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

  const buildBody = (): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      frequency: effectiveFrequency,
      startDate,
      ...(effectiveFrequency === "MONTHLY" ? { dayOfMonth: dom } : {}),
    };

    if (!isEditing) {
      if (targetMode === "new") {
        body.newRow = {
          section: newRowSection,
          name: newRowName.trim(),
          ...(newRowCategoryId ? { categoryId: newRowCategoryId } : {}),
        };
      } else {
        body.rowId = selectedRowId;
      }
    }

    if (termMode === "date" || termMode === "both") {
      body.endDate = endDate || null;
    } else {
      body.endDate = null;
    }
    if (termMode === "occurrences" || termMode === "both") {
      body.endAfterOccurrences = nOcc;
    } else {
      body.endAfterOccurrences = null;
    }

    if (amountMode === "PCT_SALES") {
      body.amountMode = "PCT_SALES";
      body.pctSales = pctSales;
      body.currency = "CLP";
      body.amount = isFinanciamiento ? (finSign === "out" ? -1 : 1) : 0;
    } else if (amountMode === "UF") {
      body.amountMode = "FIXED";
      body.currency = "UF";
      body.amountUf = amountUfMag;
      body.ufPolicy = ufPolicy;
      if (ufPolicy === "CUSTOM_DAY") body.ufCustomDay = Number(ufCustomDay) || 1;
      body.amount = signedPreviewClp ?? (isFinanciamiento ? -amountUfMag : amountUfMag);
    } else {
      body.amountMode = "FIXED";
      body.currency = "CLP";
      body.amount = signedClp;
    }
    body.note = note.trim() || null;
    return body;
  };

  const submit = async () => {
    const body = buildBody();
    if (isEditing) {
      if (!onUpdate || !editingId) return;
      const r = await onUpdate(editingId, body);
      if (r != null) onClose();
      return;
    }
    const r = await onConfirm(body);
    if (r != null) onClose();
  };

  const handleDelete = async () => {
    if (!editingId || !onDelete) return;
    const r = await onDelete(editingId);
    if (r != null) onClose();
  };

  const selectRule = (value: string) => {
    if (value === "__new__") {
      setEditingId(null);
      resetCreateForm();
      return;
    }
    const rule = existingRules.find((r) => r.id === value);
    if (!rule) return;
    setEditingId(rule.id);
    applyRuleToForm(rule);
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
              disabled={isEditing}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setTargetMode("new");
                  setEditingId(null);
                  setExistingRules([]);
                  resetCreateForm(newRowSection);
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

          {targetMode === "existing" && (
            <label className="block space-y-1 text-xs text-ds-text-3">
              <span>Recurrencia</span>
              <select
                data-testid="recurrence-selector"
                className={SELECT_CLASS}
                value={editingId ?? "__new__"}
                disabled={loadingRules}
                onChange={(e) => selectRule(e.target.value)}
              >
                {existingRules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {recurrenceOptionLabel(r)}
                  </option>
                ))}
                <option value="__new__">
                  {existingRules.length > 0 ? "Crear nueva…" : "Nueva recurrencia"}
                </option>
              </select>
              {loadingRules && (
                <span className="block text-[12px] text-ds-text-4">Cargando…</span>
              )}
              {!loadingRules && existingRules.length === 0 && (
                <span className="block text-[12px] text-ds-text-4">
                  Esta fila aún no tiene recurrencias. Completa el formulario para crear una.
                </span>
              )}
            </label>
          )}

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
              <label className="block space-y-1 text-xs text-ds-text-3">
                <span>Categoría</span>
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
                {expenseCategories.length === 0 && (
                  <span className="block text-[12px] text-ds-text-4">
                    No hay categorías de egreso en el catálogo.
                  </span>
                )}
              </label>
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

          <div className="inline-flex h-10 sm:h-9 max-w-full overflow-x-auto overflow-y-hidden rounded-full border border-ds-border-default bg-ds-surface-2 p-0.5">
            {([
              { key: "CLP" as const, label: "CLP" },
              { key: "UF" as const, label: "UF" },
              { key: "PCT_SALES" as const, label: "% ventas" },
            ]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setAmountMode(key);
                  if (key === "PCT_SALES") setFrequency("MONTHLY");
                }}
                className={`min-h-9 shrink-0 rounded-full px-3 text-[13px] font-medium ${
                  amountMode === key ? "bg-primary text-primary-foreground" : "text-ds-text-3"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {amountMode === "CLP" ? (
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
          ) : amountMode === "UF" ? (
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
          ) : (
            <>
              <label className="block space-y-1 text-xs text-ds-text-3">
                <span>% de ventas netas del mes anterior</span>
                <Input
                  className="h-10 sm:h-9"
                  inputMode="decimal"
                  value={pctSalesStr}
                  onChange={(e) => setPctSalesStr(e.target.value)}
                  placeholder="10"
                />
              </label>
              <p className="text-[12px] text-ds-text-3">
                Se proyecta como comprometido (no materializa celdas). En «Retiro socios»
                esta regla pisa el % global de configuración. Solo una regla % activa por fila
                (crear otra la reemplaza).
              </p>
              {Number.isFinite(pctSales) && pctSales > 0 && pctSales <= 100 && (
                <p className="text-[12px] text-ds-text-4">
                  Próximo mes ≈ {pctSales.toLocaleString("es-CL", { maximumFractionDigits: 2 })}%
                  de las ventas netas del mes anterior (estimado al cargar la planilla).
                </p>
              )}
            </>
          )}

          <label className="block space-y-1 text-xs text-ds-text-3">
            <span>Periodicidad</span>
            <select
              className={SELECT_CLASS}
              value={effectiveFrequency}
              disabled={amountMode === "PCT_SALES"}
              onChange={(e) => setFrequency(e.target.value)}
            >
              {Object.entries(FREQ_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          {effectiveFrequency === "MONTHLY" && (
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
            <DatePickerField value={startDate || null} onChange={(ymd) => setStartDate((ymd ?? ""))} triggerClassName={"h-10 sm:h-9"} />
          </label>

          <label className="block space-y-1 text-xs text-ds-text-3">
            <span>Nota / desglose (opcional)</span>
            <textarea
              data-testid="recurrence-note"
              value={note}
              maxLength={2000}
              rows={2}
              placeholder="Ej. contador + abogado + prevencionista"
              onChange={(e) => setNote(e.target.value)}
              className="w-full resize-none rounded-md border border-ds-border-default bg-ds-surface-1 px-2 py-1.5 text-[13px] text-ds-text-1 placeholder:text-ds-text-4 focus:border-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
            />
            <span className="block text-[12px] text-ds-text-4">
              Se muestra en cada celda proyectada de esta recurrencia.
            </span>
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
                <DatePickerField value={endDate || null} onChange={(ymd) => setEndDate((ymd ?? ""))} triggerClassName={"h-10 sm:h-9"} />
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

          {amountMode !== "PCT_SALES" ? (
            <>
              <p className="rounded border border-status-warn-border bg-status-warn-soft/40 px-2 py-1.5 text-xs text-status-warn-fg">
                {isEditing
                  ? "Guardar reescribe celdas futuras no selladas (pisa ajustes manuales futuros)."
                  : "Editar esta recurrencia reescribe celdas futuras no selladas (pisa ajustes manuales futuros)."}
              </p>
              <p className="text-[12px] text-ds-text-3">
                Materializa celdas de plan hacia adelante hasta el término (o 12 meses). En UF se
                recalcula el CLP al cambiar el valor; nunca toca semanas selladas ni el pasado.
              </p>
            </>
          ) : (
            <p className="text-[12px] text-ds-text-3">
              Modo % ventas: no escribe celdas de plan. La proyección aparece como comprometido;
              un monto de plan en el mes (o «Mover») la pisa. Semanas selladas muestran solo real.
            </p>
          )}

          {isEditing && confirmDelete && (
            <div className="space-y-2 rounded border border-status-danger-border bg-status-danger-soft/40 p-2">
              <p className="text-[13px] text-status-danger-fg">
                ¿Eliminar esta recurrencia? Se borran las celdas futuras que no estén en semanas
                cerradas. El pasado y las semanas selladas se conservan.
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
                <Button
                  variant="destructive"
                  className="h-10 sm:h-9"
                  disabled={busy || !onDelete}
                  onClick={handleDelete}
                >
                  {busy ? "Eliminando…" : "Sí, eliminar"}
                </Button>
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
            <Button variant="outline" className="h-10 sm:h-9" onClick={onClose}>
              Cancelar
            </Button>
            {!confirmDelete && (
              <Button className="h-10 sm:h-9" disabled={!canSubmit} onClick={submit}>
                {busy
                  ? (isEditing ? "Guardando…" : "Creando…")
                  : (isEditing ? "Guardar cambios" : "Crear recurrente")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
