"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CategoryOption {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onDone: () => void;
}

/**
 * Asigna N movimientos bancarios seleccionados a una categoría de flujo de
 * caja (agrupadas Ingresos / Egresos). Delega en el motor de asignación vía
 * el endpoint bulk (respeta la regla "el real consume el proyectado").
 */
export function BulkAssignCashflowDialog({ open, onOpenChange, selectedIds, onDone }: Props) {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loadingCats, setLoadingCats] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingCats(true);
    fetch("/api/finance/cashflow/categorias")
      .then((r) => r.json())
      .then((json) => {
        const cats = (json?.data ?? []) as CategoryOption[];
        setCategories(cats);
      })
      .catch(() => toast.error("No se pudieron cargar las categorías"))
      .finally(() => setLoadingCats(false));
  }, [open]);

  const income = categories.filter((c) => c.kind === "INCOME");
  const expense = categories.filter((c) => c.kind === "EXPENSE");

  const handleSubmit = async () => {
    if (!categoryId) {
      toast.error("Elegí una categoría");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/finance/cashflow/items/from-bank-tx/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankTransactionIds: selectedIds, categoryId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Error");
      const { consumed, created, skipped } = json.data as {
        consumed: number;
        created: number;
        skipped: Array<{ id: string; reason: string }>;
      };
      const parts = [`${consumed + created} asignados`];
      if (consumed > 0) parts.push(`${consumed} consumieron proyectado`);
      if (skipped.length > 0) parts.push(`${skipped.length} omitidos`);
      toast.success(parts.join(" · "));
      setCategoryId("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo asignar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Asignar a flujo de caja</DialogTitle>
          <DialogDescription>
            {selectedIds.length} movimiento{selectedIds.length === 1 ? "" : "s"} → una categoría.
            Si la categoría ya tiene monto proyectado en la semana, el real lo consume (no se suma).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label>Categoría</Label>
          <Select value={categoryId} onValueChange={setCategoryId} disabled={loadingCats}>
            <SelectTrigger className="h-11">
              <SelectValue placeholder={loadingCats ? "Cargando…" : "Elegí una categoría…"} />
            </SelectTrigger>
            <SelectContent>
              {income.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Ingresos</SelectLabel>
                  {income.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {expense.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Egresos</SelectLabel>
                  {expense.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !categoryId} className="h-11 sm:h-10">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Asignar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
