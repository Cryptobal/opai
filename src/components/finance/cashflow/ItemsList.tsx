"use client";
import { useState, useEffect, useCallback } from "react";
import { Surface } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { ItemFormDialog } from "./ItemFormDialog";
import { humanReadableRecurrence } from "./recurrence-label";

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

interface CategoryLite {
  id: string;
  code: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  color: string | null;
}

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
  category: { code: string; name: string; color: string | null };
}

export function ItemsList({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [categories, setCategories] = useState<CategoryLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterKind, setFilterKind] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterKind !== "all") params.set("kind", filterKind);
    if (filterSource !== "all") params.set("source", filterSource);
    const r = await fetch(`/api/finance/cashflow/items?${params}`);
    const j = await r.json();
    if (j?.success) setItems(j.data);
    setLoading(false);
  }, [filterKind, filterSource]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/finance/cashflow/categorias")
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setCategories(j.data);
      });
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este item? Esta acción no se puede deshacer.")) return;
    const r = await fetch(`/api/finance/cashflow/items/${id}`, { method: "DELETE" });
    const j = await r.json();
    if (j?.success) load();
    else alert(j?.error ?? "Error al eliminar");
  }

  const filtered = items.filter((i) =>
    search ? i.name.toLowerCase().includes(search.toLowerCase()) : true,
  );

  return (
    <Surface elevation={1} padding="md">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-[180px] text-[12px]"
          />
          <Select value={filterKind} onValueChange={setFilterKind}>
            <SelectTrigger className="h-8 w-[120px] text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tipo: todos</SelectItem>
              <SelectItem value="INCOME">Ingresos</SelectItem>
              <SelectItem value="EXPENSE">Egresos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="h-8 w-[140px] text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Origen: todos</SelectItem>
              <SelectItem value="MANUAL">Manual</SelectItem>
              <SelectItem value="SUPPLIER">Proveedor</SelectItem>
              <SelectItem value="OTHER">Otros</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo item
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="text-[12px] w-full">
          <thead>
            <tr className="border-b border-border text-ds-text-3">
              <th className="text-left p-2">Nombre</th>
              <th className="text-left p-2">Categoría</th>
              <th className="text-left p-2">Recurrencia</th>
              <th className="text-right p-2">Monto</th>
              <th className="text-left p-2">Origen</th>
              <th className="text-center p-2">Estado</th>
              {canManage && <th className="p-2">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-4 text-center text-ds-text-3">
                  Cargando...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4 text-center text-ds-text-3">
                  Sin items
                </td>
              </tr>
            ) : (
              filtered.map((i) => (
                <tr key={i.id} className="border-b border-border hover:bg-muted/20">
                  <td className="p-2">
                    <div className="font-medium">{i.name}</div>
                    {i.description && (
                      <div className="text-[11px] text-ds-text-3 truncate max-w-[260px]">
                        {i.description}
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-ds-text-2">{i.category.name}</td>
                  <td className="p-2 text-ds-text-2">{humanReadableRecurrence(i)}</td>
                  <td className="p-2 text-right font-mono">
                    {i.currency} {fmt.format(Number(i.amount))}
                  </td>
                  <td className="p-2 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded-ds-sm bg-muted/40 text-ds-text-3">
                      {i.source}
                    </span>
                  </td>
                  <td className="p-2 text-center">
                    {i.isActive ? (
                      <span className="text-status-ok-fg">Activo</span>
                    ) : (
                      <span className="text-ds-text-3">Inactivo</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditing(i)}
                          className="p-1 hover:bg-muted/40 rounded"
                          aria-label="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(i.id)}
                          className="p-1 hover:bg-status-warn-soft rounded text-status-warn-fg"
                          aria-label="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ItemFormDialog
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        item={editing}
        categories={categories}
        onSaved={() => {
          load();
          setCreating(false);
          setEditing(null);
        }}
      />
    </Surface>
  );
}
