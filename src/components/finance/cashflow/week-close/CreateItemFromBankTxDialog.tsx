"use client";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fmtCLP } from "./types";

interface CategoryOption {
  id: string;
  code: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  bankTxId: string;
  bankTxAmount: number;
  bankTxDescription: string;
  mode: "recurrent" | "once";
}

const RECURRENCE_OPTIONS: Array<{
  value: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  label: string;
}> = [
  { value: "WEEKLY", label: "Semanal" },
  { value: "BIWEEKLY", label: "Quincenal" },
  { value: "MONTHLY", label: "Mensual" },
  { value: "QUARTERLY", label: "Trimestral" },
  { value: "YEARLY", label: "Anual" },
];

/**
 * Dialog para crear un FinanceCashflowItem nuevo a partir de un bank tx
 * sin clasificar. La occurrence PAID se crea en la fecha del tx y queda
 * vinculada (POST /items/from-bank-tx).
 *
 * Filtra las categorías por el kind inferido del signo del tx (positivo =
 * INCOME, negativo = EXPENSE). En modo `once`, fuerza recurrence=ONCE y no
 * muestra el selector.
 */
export function CreateItemFromBankTxDialog({
  open,
  onClose,
  onCreated,
  bankTxId,
  bankTxAmount,
  bankTxDescription,
  mode,
}: Props) {
  const inferredKind: "INCOME" | "EXPENSE" =
    bankTxAmount >= 0 ? "INCOME" : "EXPENSE";
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [name, setName] = useState<string>(bankTxDescription.slice(0, 100));
  const [recurrence, setRecurrence] = useState<
    "ONCE" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY"
  >(mode === "once" ? "ONCE" : "MONTHLY");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/finance/cashflow/categories?kind=${inferredKind}`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) {
          const list: CategoryOption[] = j.data.filter(
            (c: CategoryOption) => c.kind === inferredKind,
          );
          setCategories(list);
          if (list.length > 0) setCategoryId(list[0].id);
        }
      })
      .catch(() => toast.error("Error cargando categorías"));
  }, [open, inferredKind]);

  async function handleSubmit() {
    if (!categoryId) {
      toast.error("Selecciona una categoría");
      return;
    }
    if (name.trim().length < 2) {
      toast.error("Nombre muy corto");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        "/api/finance/cashflow/items/from-bank-tx",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bankTransactionId: bankTxId,
            categoryId,
            name: name.trim(),
            recurrence,
          }),
        },
      );
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      toast.success(
        mode === "recurrent"
          ? "Flujo recurrente creado"
          : "Flujo puntual creado",
      );
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "recurrent" ? "Crear flujo recurrente" : "Crear flujo puntual"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="text-xs text-muted-foreground border-b border-border/40 pb-2">
            Mov: {bankTxDescription.slice(0, 80)}
            <div className="font-mono mt-1">
              {bankTxAmount >= 0 ? "+" : ""}
              {fmtCLP.format(bankTxAmount)} ({inferredKind})
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Categoría</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Nombre del flujo</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10"
              maxLength={200}
            />
          </div>
          {mode === "recurrent" && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Frecuencia</label>
              <select
                value={recurrence}
                onChange={(e) =>
                  setRecurrence(
                    e.target.value as
                      | "WEEKLY"
                      | "BIWEEKLY"
                      | "MONTHLY"
                      | "QUARTERLY"
                      | "YEARLY",
                  )
                }
                className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm"
              >
                {RECURRENCE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={saving} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="flex-1">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Crear
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
