"use client";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Info } from "lucide-react";

interface CategoryLite {
  id: string;
  code: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
}

interface ItemLike {
  id: string;
  name: string;
  description: string | null;
  amount: string | number;
  currency: string;
  recurrence: string;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  monthOfYear: number | null;
  startDate: string;
  endDate: string | null;
  category: { code: string };
  kind: "INCOME" | "EXPENSE";
  ufFixingPolicy?: string | null;
  ufFixingDay?: number | null;
  /** Origen del ítem. Si es de un módulo upstream (PAYROLL_*, CONTRACT,
   *  IVA, TURNOS_EXTRA, RECURRING_DTE), el cron diario lo sobrescribe, así
   *  que solo se pueden editar campos cosméticos desde acá. */
  source?: string;
}

/** Sources cuya plata/recurrencia se materializa desde otro módulo. El
 *  formulario muestra estos campos en modo solo-lectura y solo permite
 *  editar nombre/descripción para que el usuario no pierda cambios. */
const LOCKED_SOURCES = new Set([
  "CONTRACT",
  "PAYROLL",
  "PAYROLL_LIQUIDO",
  "PAYROLL_PREVIRED",
  "TURNOS_EXTRA",
  "IVA",
  "RECURRING_DTE",
]);

const SOURCE_LABEL_UI: Record<string, string> = {
  CONTRACT: "Contrato del CRM",
  PAYROLL: "Dotación de instalaciones",
  PAYROLL_LIQUIDO: "Sueldo líquido (Dotación)",
  PAYROLL_PREVIRED: "PreviRed (Dotación)",
  TURNOS_EXTRA: "Histórico de turnos extra",
  IVA: "F29 del SII",
  RECURRING_DTE: "DTE recurrente",
};

interface Props {
  open: boolean;
  item: ItemLike | null;
  categories: CategoryLite[];
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  categoryId: string;
  kind: "INCOME" | "EXPENSE";
  name: string;
  description: string;
  amount: string;
  currency: "CLP" | "UF";
  ufFixingPolicy: string;
  ufFixingDay: string;
  recurrence: string;
  dayOfMonth: string;
  dayOfWeek: string;
  monthOfYear: string;
  startDate: string;
  endDate: string;
  notes: string;
}

const clpFmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const ufFmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

function formatAmountDisplay(raw: string, currency: "CLP" | "UF"): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d,.-]/g, "");
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return raw;
  return currency === "UF" ? ufFmt.format(n) : clpFmt.format(n);
}

function parseAmount(raw: string): number {
  if (!raw) return NaN;
  const cleaned = raw.replace(/\./g, "").replace(",", ".");
  return Number(cleaned);
}

const blank: FormState = {
  categoryId: "",
  kind: "EXPENSE",
  name: "",
  description: "",
  amount: "",
  currency: "CLP",
  ufFixingPolicy: "RUN_DAY",
  ufFixingDay: "",
  recurrence: "MONTHLY",
  dayOfMonth: "5",
  dayOfWeek: "5",
  monthOfYear: "1",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
  notes: "",
};

export function ItemFormDialog({ open, item, categories, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = item !== null;
  const isLocked = isEdit && !!item?.source && LOCKED_SOURCES.has(item.source);
  const lockedSourceLabel =
    item?.source && SOURCE_LABEL_UI[item.source]
      ? SOURCE_LABEL_UI[item.source]
      : item?.source ?? "otra fuente";

  useEffect(() => {
    if (item) {
      const cat = categories.find((c) => c.code === item.category.code);
      const itemCurrency = (item.currency as "CLP" | "UF") ?? "CLP";
      setForm({
        categoryId: cat?.id ?? "",
        kind: item.kind,
        name: item.name,
        description: item.description ?? "",
        amount: formatAmountDisplay(String(item.amount), itemCurrency),
        currency: itemCurrency,
        ufFixingPolicy: item.ufFixingPolicy ?? "RUN_DAY",
        ufFixingDay: item.ufFixingDay ? String(item.ufFixingDay) : "",
        recurrence: item.recurrence,
        dayOfMonth: item.dayOfMonth !== null ? String(item.dayOfMonth) : "5",
        dayOfWeek: item.dayOfWeek !== null ? String(item.dayOfWeek) : "5",
        monthOfYear: item.monthOfYear !== null ? String(item.monthOfYear) : "1",
        startDate: item.startDate.slice(0, 10),
        endDate: item.endDate ? item.endDate.slice(0, 10) : "",
        notes: "",
      });
    } else {
      setForm(blank);
    }
    setError(null);
  }, [item, categories, open]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setAmount(raw: string) {
    setForm((f) => ({ ...f, amount: formatAmountDisplay(raw, f.currency) }));
  }

  function setCurrency(c: "CLP" | "UF") {
    setForm((f) => ({ ...f, currency: c, amount: formatAmountDisplay(f.amount, c) }));
  }

  function categoryChanged(id: string) {
    const cat = categories.find((c) => c.id === id);
    setForm((f) => ({ ...f, categoryId: id, kind: cat?.kind ?? f.kind }));
  }

  async function save() {
    setError(null);
    let body: Record<string, unknown>;

    if (isLocked) {
      // Item auto-generado: el backend rechaza cambios de monto/recurrencia
      // /fechas. Solo enviamos los campos cosméticos para no fallar el PUT.
      body = {
        name: form.name,
        description: form.description || undefined,
        notes: form.notes || undefined,
      };
    } else {
      const amountValue = parseAmount(form.amount);
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        setError("Monto inválido. Ingresa un número mayor a 0.");
        return;
      }
      body = {
        categoryId: form.categoryId,
        kind: form.kind,
        name: form.name,
        description: form.description || undefined,
        amount: amountValue,
        currency: form.currency,
        recurrence: form.recurrence,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        notes: form.notes || undefined,
      };
      if (form.currency === "UF") {
        body.ufFixingPolicy = form.ufFixingPolicy;
        if (form.ufFixingPolicy === "CUSTOM_DAY" && form.ufFixingDay) {
          body.ufFixingDay = Number(form.ufFixingDay);
        }
      }
      if (["WEEKLY", "BIWEEKLY"].includes(form.recurrence)) {
        body.dayOfWeek = Number(form.dayOfWeek);
      }
      if (["MONTHLY", "QUARTERLY", "YEARLY"].includes(form.recurrence)) {
        body.dayOfMonth = Number(form.dayOfMonth);
      }
      if (form.recurrence === "YEARLY") {
        body.monthOfYear = Number(form.monthOfYear);
      }
    }

    setSaving(true);
    const url = isEdit ? `/api/finance/cashflow/items/${item!.id}` : "/api/finance/cashflow/items";
    const method = isEdit ? "PUT" : "POST";
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    setSaving(false);
    if (j?.success) {
      onSaved();
    } else {
      setError(j?.error ?? "Error al guardar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl w-[calc(100vw-1.5rem)] sm:w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar item" : "Nuevo item proyectado"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          {isLocked && (
            <div className="flex gap-2 rounded-ds-md border border-status-info-border bg-status-info-soft px-3 py-2.5">
              <Info className="h-4 w-4 text-status-info-fg shrink-0 mt-0.5" />
              <div className="text-[12px] text-status-info-fg">
                <p className="font-medium">Ítem auto-generado desde {lockedSourceLabel}</p>
                <p className="mt-0.5 text-status-info-fg/85">
                  El monto, recurrencia, fechas y vínculos los recalcula
                  automáticamente el sistema desde la fuente original. Si los
                  editas acá, el cron diario los va a sobrescribir. Para
                  cambiarlos de verdad, edita la fuente
                  {item?.source === "CONTRACT" ? " (Contrato del CRM)" : ""}
                  {item?.source?.startsWith("PAYROLL") ? " (Dotación de la instalación)" : ""}
                  {item?.source === "IVA" ? " (configuración de F29)" : ""}
                  . Acá solo puedes ajustar nombre, descripción y notas.
                </p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Categoría</Label>
              <Select value={form.categoryId} onValueChange={categoryChanged} disabled={isLocked}>
                <SelectTrigger className="h-10 sm:h-9">
                  <SelectValue placeholder="Selecciona..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.kind === "INCOME" ? "↑" : "↓"} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nombre</Label>
              <Input
                className="h-10 sm:h-9"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Descripción</Label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Monto</Label>
              <Input
                className="h-10 sm:h-9 font-mono text-right"
                inputMode="decimal"
                placeholder={form.currency === "UF" ? "0,00" : "0"}
                value={form.amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isLocked}
              />
              <p className="mt-1 text-[12px] text-ds-text-3">
                {form.currency === "CLP" ? "Pesos chilenos. Ej: 150.000" : "UF con 2 decimales. Ej: 12,50"}
              </p>
            </div>
            <div>
              <Label>Moneda</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => setCurrency(v as "CLP" | "UF")}
                disabled={isLocked}
              >
                <SelectTrigger className="h-10 sm:h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLP">CLP</SelectItem>
                  <SelectItem value="UF">UF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Recurrencia</Label>
              <Select value={form.recurrence} onValueChange={(v) => set("recurrence", v)} disabled={isLocked}>
                <SelectTrigger className="h-10 sm:h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ONCE">Único</SelectItem>
                  <SelectItem value="WEEKLY">Semanal</SelectItem>
                  <SelectItem value="BIWEEKLY">Quincenal</SelectItem>
                  <SelectItem value="MONTHLY">Mensual</SelectItem>
                  <SelectItem value="QUARTERLY">Trimestral</SelectItem>
                  <SelectItem value="YEARLY">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.currency === "UF" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Política UF</Label>
                <Select
                  value={form.ufFixingPolicy}
                  onValueChange={(v) => set("ufFixingPolicy", v)}
                  disabled={isLocked}
                >
                  <SelectTrigger className="h-10 sm:h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RUN_DAY">Día de pago</SelectItem>
                    <SelectItem value="LAST_DAY_PREV_MONTH">Último día mes anterior</SelectItem>
                    <SelectItem value="FIRST_DAY_MONTH">Primer día del mes</SelectItem>
                    <SelectItem value="LAST_DAY_MONTH">Último día del mes</SelectItem>
                    <SelectItem value="CUSTOM_DAY">Día específico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.ufFixingPolicy === "CUSTOM_DAY" && (
                <div>
                  <Label>Día (1-31)</Label>
                  <Input
                    className="h-10 sm:h-9"
                    type="number"
                    min={1}
                    max={31}
                    value={form.ufFixingDay}
                    onChange={(e) => set("ufFixingDay", e.target.value)}
                    disabled={isLocked}
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {["WEEKLY", "BIWEEKLY"].includes(form.recurrence) && (
              <div>
                <Label>Día de la semana</Label>
                <Select value={form.dayOfWeek} onValueChange={(v) => set("dayOfWeek", v)} disabled={isLocked}>
                  <SelectTrigger className="h-10 sm:h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Domingo</SelectItem>
                    <SelectItem value="1">Lunes</SelectItem>
                    <SelectItem value="2">Martes</SelectItem>
                    <SelectItem value="3">Miércoles</SelectItem>
                    <SelectItem value="4">Jueves</SelectItem>
                    <SelectItem value="5">Viernes</SelectItem>
                    <SelectItem value="6">Sábado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {["MONTHLY", "QUARTERLY", "YEARLY"].includes(form.recurrence) && (
              <div>
                <Label>Día del mes</Label>
                <Input
                  className="h-10 sm:h-9"
                  type="number"
                  min={-1}
                  max={31}
                  value={form.dayOfMonth}
                  onChange={(e) => set("dayOfMonth", e.target.value)}
                  disabled={isLocked}
                />
                <p className="mt-1 text-[12px] text-ds-text-3">
                  Día en que cae el pago. Usa <code className="font-mono">-1</code> para el último día (útil para arriendos que vencen fin de mes).
                </p>
              </div>
            )}
            {form.recurrence === "YEARLY" && (
              <div>
                <Label>Mes del año (1-12)</Label>
                <Input
                  className="h-10 sm:h-9"
                  type="number"
                  min={1}
                  max={12}
                  value={form.monthOfYear}
                  onChange={(e) => set("monthOfYear", e.target.value)}
                  disabled={isLocked}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Inicio</Label>
              <Input
                className="h-10 sm:h-9"
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                disabled={isLocked}
              />
            </div>
            <div>
              <Label>Fin (opcional)</Label>
              <Input
                className="h-10 sm:h-9"
                type="date"
                value={form.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                disabled={isLocked}
              />
            </div>
          </div>

          <div>
            <Label>Notas</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          {error && <p className="text-status-warn-fg text-[12px]">{error}</p>}
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={saving}
            className="w-full sm:w-auto h-10 sm:h-9"
          >
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={
              saving ||
              !form.name ||
              (!isLocked && (!form.categoryId || !form.amount.trim()))
            }
            className="w-full sm:w-auto h-10 sm:h-9"
          >
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
