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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CategoryLite {
  id: string;
  code: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
}

interface Props {
  open: boolean;
  /** Día del mes pre-seleccionado al abrir desde una celda. */
  defaultDayOfMonth?: number;
  /** Monto pre-poblado (valor absoluto, en CLP). */
  defaultAmount?: number;
  /** Categoría pre-seleccionada (id). */
  defaultCategoryId?: string;
  /** Hint visible cuando el modal abre desde un flow específico (ej. cuadratura). */
  hint?: string;
  /** Categorías disponibles (cargadas por el padre). */
  categories: CategoryLite[];
  onClose: () => void;
  onCreated: () => void;
}

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

function parseAmount(raw: string): number {
  if (!raw) return NaN;
  return Number(raw.replace(/\./g, "").replace(",", "."));
}

function formatAmount(raw: string): string {
  const n = parseAmount(raw);
  if (!Number.isFinite(n)) return raw;
  return fmt.format(n);
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Construye una fecha inicial razonable según `defaultDayOfMonth`. */
function initialStartDate(defaultDayOfMonth?: number): string {
  const today = new Date();
  if (!defaultDayOfMonth || defaultDayOfMonth < 1 || defaultDayOfMonth > 31) {
    return toISO(today);
  }
  const target = new Date(today.getFullYear(), today.getMonth(), defaultDayOfMonth);
  if (target.getTime() < today.setHours(0, 0, 0, 0)) {
    target.setMonth(target.getMonth() + 1);
  }
  return toISO(target);
}

type RepeatMode = "once" | "monthly_count" | "monthly_until";

/**
 * Modal mínimo para crear un movimiento desde el flujo de caja.
 * El nombre del movimiento se toma de la categoría seleccionada — el usuario
 * solo elige categoría, monto, fecha y, si quiere recurrencia, una cantidad
 * de repeticiones mensuales o una fecha de término.
 */
export function QuickItemModal({
  open,
  defaultDayOfMonth,
  defaultAmount,
  defaultCategoryId,
  hint,
  categories,
  onClose,
  onCreated,
}: Props) {
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [startDate, setStartDate] = useState(initialStartDate(defaultDayOfMonth));
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("once");
  const [repeatCount, setRepeatCount] = useState("3");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStartDate(initialStartDate(defaultDayOfMonth));
      setEndDate("");
      setRepeatMode("once");
      setRepeatCount("3");
      setError(null);
      if (defaultAmount !== undefined && Number.isFinite(defaultAmount)) {
        setAmount(fmt.format(Math.abs(Math.round(defaultAmount))));
      } else {
        setAmount("");
      }
      setCategoryId(defaultCategoryId ?? "");
    }
  }, [open, defaultDayOfMonth, defaultAmount, defaultCategoryId]);

  async function save() {
    setError(null);
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) {
      setError("Selecciona una categoría");
      return;
    }
    const amt = parseAmount(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Monto inválido");
      return;
    }
    if (!startDate) {
      setError("Selecciona una fecha");
      return;
    }
    const startObj = new Date(`${startDate}T00:00:00`);
    if (Number.isNaN(startObj.getTime())) {
      setError("Fecha inválida");
      return;
    }
    const dom = startObj.getDate();

    let recurrence: "ONCE" | "MONTHLY" = "ONCE";
    let computedEndDate: string | undefined;

    if (repeatMode === "once") {
      recurrence = "ONCE";
    } else if (repeatMode === "monthly_count") {
      recurrence = "MONTHLY";
      const n = Number(repeatCount);
      if (!Number.isFinite(n) || n < 1 || n > 240) {
        setError("Cantidad de repeticiones: 1 a 240");
        return;
      }
      // n repeticiones empezando en startDate => endDate = startDate + (n-1) meses.
      const endObj = new Date(startObj);
      endObj.setMonth(endObj.getMonth() + (n - 1));
      computedEndDate = toISO(endObj);
    } else {
      recurrence = "MONTHLY";
      if (!endDate) {
        setError("Selecciona la fecha de término");
        return;
      }
      if (endDate < startDate) {
        setError("La fecha de término no puede ser anterior al inicio");
        return;
      }
      computedEndDate = endDate;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        categoryId,
        kind: cat.kind,
        name: cat.name,
        amount: amt,
        currency: "CLP",
        recurrence,
        startDate,
      };
      if (recurrence === "MONTHLY") {
        body.dayOfMonth = dom;
      }
      if (computedEndDate) {
        body.endDate = computedEndDate;
      }
      const r = await fetch("/api/finance/cashflow/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j?.success) {
        setAmount("");
        setCategoryId("");
        onCreated();
      } else {
        setError(j?.error ?? "Error al crear");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md w-[calc(100vw-1.5rem)]">
        <DialogHeader>
          <DialogTitle>Nuevo movimiento</DialogTitle>
        </DialogHeader>
        {hint && (
          <div className="rounded-ds-md bg-status-info-soft/40 border border-status-info-border/40 px-3 py-2 text-[12px] text-status-info-fg">
            {hint}
          </div>
        )}
        <div className="grid gap-3 py-2">
          <div>
            <Label>Categoría</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-10 sm:h-9">
                <SelectValue placeholder="Selecciona…" />
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Monto (CLP)</Label>
              <Input
                className="h-10 sm:h-9 font-mono text-right"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(formatAmount(e.target.value))}
                placeholder="150.000"
              />
            </div>
            <div>
              <Label>Fecha</Label>
              <Input
                className="h-10 sm:h-9"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Repetición</Label>
            <Select
              value={repeatMode}
              onValueChange={(v) => setRepeatMode(v as RepeatMode)}
            >
              <SelectTrigger className="h-10 sm:h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="once">Una sola vez</SelectItem>
                <SelectItem value="monthly_count">Mensual, N repeticiones</SelectItem>
                <SelectItem value="monthly_until">Mensual hasta fecha</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {repeatMode === "monthly_count" && (
            <div>
              <Label>Cantidad de repeticiones</Label>
              <Input
                className="h-10 sm:h-9"
                type="number"
                min={1}
                max={240}
                value={repeatCount}
                onChange={(e) => setRepeatCount(e.target.value)}
              />
              <p className="mt-1 text-[12px] text-ds-text-3">
                Se repite mensualmente el día {new Date(`${startDate}T00:00:00`).getDate() || "—"}.
              </p>
            </div>
          )}
          {repeatMode === "monthly_until" && (
            <div>
              <Label>Hasta el</Label>
              <Input
                className="h-10 sm:h-9"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
              />
              <p className="mt-1 text-[12px] text-ds-text-3">
                Se repite mensualmente hasta esta fecha (inclusive).
              </p>
            </div>
          )}
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
            disabled={saving || !categoryId || !amount.trim() || !startDate}
            className="w-full sm:w-auto h-10 sm:h-9"
          >
            {saving ? "Creando…" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
