"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Category {
  id: string;
  code: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  mappedAccountCount: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cuenta contable detectada en el bank tx que no tiene mapping. */
  accountPlanId: string;
  accountCode: string;
  accountName: string;
  /** "INCOME" si el bank tx es crédito, "EXPENSE" si débito. Filtra opciones. */
  preferredKind: "INCOME" | "EXPENSE";
  onMapped: () => void;
}

export function CategoryMappingDialog({
  open,
  onOpenChange,
  accountPlanId,
  accountCode,
  accountName,
  preferredKind,
  onMapped,
}: Props) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/finance/cashflow/categorias?kind=${preferredKind}`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setCategories(j.data);
      })
      .finally(() => setLoading(false));
  }, [open, preferredKind]);

  const save = async () => {
    if (!selectedId) {
      toast.error("Seleccioná una categoría");
      return;
    }
    setSaving(true);
    try {
      const cur = await fetch(`/api/finance/cashflow/categorias/${selectedId}/accounts`).then((r) =>
        r.json(),
      );
      const currentIds: string[] = cur?.success ? cur.data.map((m: { accountPlanId: string }) => m.accountPlanId) : [];
      const next = currentIds.includes(accountPlanId) ? currentIds : [...currentIds, accountPlanId];
      const res = await fetch(`/api/finance/cashflow/categorias/${selectedId}/accounts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountPlanIds: next }),
      });
      const j = await res.json();
      if (!j?.success) throw new Error(j?.error ?? "Error al mapear");
      toast.success("Cuenta contable mapeada");
      onMapped();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-status-warn-fg mb-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="text-[10px] font-mono uppercase tracking-[0.08em]">
              Cuenta contable sin mapear
            </span>
          </div>
          <DialogTitle className="text-[18px] leading-tight">
            ¿A qué categoría del flujo de caja pertenece este movimiento?
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Tu decisión mapea la cuenta para todos los movimientos futuros con la misma cuenta contable.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-muted/30 p-3 text-[12px]">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase text-muted-foreground">Cuenta detectada:</span>
            <span className="font-mono font-semibold">{accountCode}</span>
          </div>
          <div className="text-[11.5px] text-muted-foreground mt-0.5">{accountName}</div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando categorías...
          </div>
        )}

        {categories && (
          <ul className="space-y-1 max-h-[280px] overflow-y-auto">
            {categories.map((c) => (
              <li key={c.id}>
                <label
                  className={cn(
                    "flex items-center gap-3 p-2.5 rounded-md border cursor-pointer transition",
                    selectedId === c.id
                      ? "border-primary/50 bg-primary/5"
                      : "border-border hover:bg-muted/30",
                  )}
                >
                  <input
                    type="radio"
                    name="cat"
                    className="accent-primary"
                    checked={selectedId === c.id}
                    onChange={() => setSelectedId(c.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[12.5px]">
                      <span className="font-mono text-[11px] text-muted-foreground">{c.code}</span>
                      {" — "}
                      {c.name}
                    </div>
                    <div className="text-[10.5px] text-muted-foreground">
                      {c.kind === "INCOME" ? "Ingreso" : "Egreso"} · {c.mappedAccountCount} cuenta(s) mapeadas
                    </div>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Recordar después
          </Button>
          <Button onClick={save} disabled={saving || !selectedId}>
            {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Asignar y continuar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
