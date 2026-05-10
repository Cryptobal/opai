"use client";
import { useEffect, useState } from "react";
import { Loader2, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItemFormDialog } from "./ItemFormDialog";

interface ItemRow {
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
  isActive: boolean;
  source: string;
  kind: "INCOME" | "EXPENSE";
}

interface ItemRowWithCategory extends ItemRow {
  category: { code: string; name: string; color: string | null };
}

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

export function CategoryItemsList({
  categoryId,
  categoryCode,
  categoryName,
  categoryKind,
  canManage,
}: {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  categoryKind: "INCOME" | "EXPENSE";
  canManage: boolean;
}) {
  const [items, setItems] = useState<ItemRowWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ItemRowWithCategory | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/finance/cashflow/categorias/${categoryId}/items`);
      const j = await r.json();
      if (j?.success) {
        const withCat: ItemRowWithCategory[] = (j.data as ItemRow[]).map((it) => ({
          ...it,
          category: { code: categoryCode, name: categoryName, color: null },
        }));
        setItems(withCat);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-[12px] text-ds-text-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando ítems...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-ds-text-3">
          {items.length === 0
            ? "Sin ítems manuales en esta categoría."
            : `${items.length} ítem${items.length !== 1 ? "s" : ""} manual${items.length !== 1 ? "es" : ""}`}
        </p>
        {canManage && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)} className="h-7 text-[12px]">
            <Plus className="h-3.5 w-3.5 mr-1" /> Nuevo ítem
          </Button>
        )}
      </div>

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((i) => (
            <li
              key={i.id}
              className="flex items-center justify-between gap-2 rounded-ds-sm border border-border bg-background px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium truncate">{i.name}</div>
                <div className="text-[12px] text-ds-text-3 truncate">
                  {i.recurrence} · {i.currency} {fmt.format(Number(i.amount))}
                </div>
              </div>
              {canManage && (
                <button
                  onClick={() => setEditing(i)}
                  className="p-1 rounded hover:bg-muted/40"
                  aria-label="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ItemFormDialog
        open={creating || editing !== null}
        item={editing}
        categories={[{ id: categoryId, code: categoryCode, name: categoryName, kind: categoryKind }]}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          load();
        }}
      />
    </div>
  );
}
