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

/**
 * Modal mínimo para crear un ítem mensual desde una celda del calendario.
 * Solo expone los campos esenciales: categoría, nombre, monto (CLP), día del mes.
 * Para configuraciones avanzadas (UF, recurrencia distinta, etc.) se usa el
 * formulario completo (ItemFormDialog).
 */
export function QuickItemModal({
  open,
  defaultDayOfMonth,
  categories,
  onClose,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState(String(defaultDayOfMonth ?? 5));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset cuando cambia el día default (al abrir desde otra celda)
  useEffect(() => {
    if (open) {
      setDayOfMonth(String(defaultDayOfMonth ?? 5));
      setError(null);
    }
  }, [open, defaultDayOfMonth]);

  async function save() {
    setError(null);
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) {
      setError("Selecciona una categoría");
      return;
    }
    if (!name.trim()) {
      setError("Ingresa un nombre (ej: Movistar)");
      return;
    }
    const amt = parseAmount(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Monto inválido");
      return;
    }
    const dom = Number(dayOfMonth);
    if (!Number.isFinite(dom) || dom < -1 || dom > 31 || dom === 0) {
      setError("Día del mes debe ser 1-31 o -1 (último)");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/finance/cashflow/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          kind: cat.kind,
          name: name.trim(),
          amount: amt,
          currency: "CLP",
          recurrence: "MONTHLY",
          dayOfMonth: dom,
          startDate: new Date().toISOString().slice(0, 10),
        }),
      });
      const j = await r.json();
      if (j?.success) {
        setName("");
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
          <DialogTitle>Nuevo ítem mensual</DialogTitle>
        </DialogHeader>
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
          <div>
            <Label>Nombre</Label>
            <Input
              className="h-10 sm:h-9"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Movistar, Edelmag"
            />
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
              <Label>Día del mes</Label>
              <Input
                className="h-10 sm:h-9"
                type="number"
                min={-1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
              />
              <p className="mt-1 text-[12px] text-ds-text-3">
                <code className="font-mono">-1</code> = último día.
              </p>
            </div>
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
            disabled={saving || !categoryId || !name.trim() || !amount.trim()}
            className="w-full sm:w-auto h-10 sm:h-9"
          >
            {saving ? "Creando…" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
