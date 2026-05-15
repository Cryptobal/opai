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
import { Plus, Pencil, Trash2, Lock } from "lucide-react";
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

  // Sources que NO se muestran en esta tab. Cada uno vive en su propio
  // módulo (contratos CRM, dotación, plantillas DTE, F29) y mezclarlos
  // acá da una vista de dump confusa. La proyección semanal/mensual los
  // sigue tomando para los totales — esta tab es solo para items que el
  // usuario gestiona manualmente desde acá. `OTHER` queda incluido como
  // red de seguridad: es un source legacy que no debería volver a
  // crearse (los scripts que lo usaban son one-shot ya ejecutados).
  const HIDDEN_SOURCES = new Set([
    "CONTRACT",
    "PAYROLL",
    "PAYROLL_LIQUIDO",
    "PAYROLL_PREVIRED",
    "TURNOS_EXTRA",
    "QUINCENA",
    "RETIRO_SOCIO",
    "IVA",
    "RECURRING_DTE",
    "OTHER",
  ]);

  const isAuto = (s: string) => HIDDEN_SOURCES.has(s);
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

  const filtered = items.filter((i) => {
    if (HIDDEN_SOURCES.has(i.source)) return false;
    return search ? i.name.toLowerCase().includes(search.toLowerCase()) : true;
  });

  return (
    <Surface elevation={1} padding="md">
      {/* Filters: full-width stacked on mobile, inline on tablet+. */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-2 mb-3">
        <Input
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 sm:h-9 w-full sm:w-[200px] text-[13px]"
        />
        <div className="grid grid-cols-2 sm:flex gap-2">
          <Select value={filterKind} onValueChange={setFilterKind}>
            <SelectTrigger className="h-10 sm:h-9 w-full sm:w-[140px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tipo: todos</SelectItem>
              <SelectItem value="INCOME">Ingresos</SelectItem>
              <SelectItem value="EXPENSE">Egresos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="h-10 sm:h-9 w-full sm:w-[160px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Origen: todos</SelectItem>
              <SelectItem value="MANUAL">Manual</SelectItem>
              <SelectItem value="SUPPLIER">Proveedor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <Button
            size="sm"
            onClick={() => setCreating(true)}
            className="h-10 sm:h-9 w-full sm:w-auto sm:ml-auto"
          >
            <Plus className="h-4 w-4 mr-1" /> Nuevo item
          </Button>
        )}
      </div>

      {loading ? (
        <p className="p-4 text-center text-ds-text-3 text-[13px]">Cargando...</p>
      ) : filtered.length === 0 ? (
        <p className="p-4 text-center text-ds-text-3 text-[13px]">Sin items</p>
      ) : (
        <>
          {/* Mobile: card list */}
          <ul className="sm:hidden space-y-2">
            {filtered.map((i) => (
              <li key={i.id} className="rounded-ds-md border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[13px] truncate">{i.name}</div>
                    <div className="text-[12px] text-ds-text-3 truncate">
                      {i.category.name} · {humanReadableRecurrence(i)}
                    </div>
                    {i.description && (
                      <div className="text-[12px] text-ds-text-3 mt-1 line-clamp-2">
                        {i.description}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`font-mono text-[13px] font-semibold ${
                        i.kind === "INCOME" ? "text-status-ok-fg" : "text-status-warn-fg"
                      }`}
                    >
                      {i.kind === "INCOME" ? "+" : "−"}
                      {i.currency} {fmt.format(Number(i.amount))}
                    </div>
                    <div className="flex items-center gap-1 mt-1 justify-end">
                      <span className="text-[11px] px-1.5 py-0.5 rounded-ds-sm bg-muted/40 text-ds-text-3">
                        {i.source}
                      </span>
                      {!i.isActive && (
                        <span className="text-[11px] text-ds-text-3">Inactivo</span>
                      )}
                    </div>
                  </div>
                </div>
                {canManage && (
                  <div className="flex gap-2 mt-2 pt-2 border-t border-border">
                    <button
                      onClick={() => setEditing(i)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-ds-sm hover:bg-muted/40 text-[12px] text-ds-text-2"
                      title={
                        isAuto(i.source)
                          ? "Auto-generado: solo puedes editar nombre/notas"
                          : "Editar"
                      }
                    >
                      {isAuto(i.source) ? (
                        <Lock className="h-3.5 w-3.5" />
                      ) : (
                        <Pencil className="h-3.5 w-3.5" />
                      )}{" "}
                      {isAuto(i.source) ? "Ver" : "Editar"}
                    </button>
                    <button
                      onClick={() => !isAuto(i.source) && handleDelete(i.id)}
                      disabled={isAuto(i.source)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-ds-sm text-[12px] ${
                        isAuto(i.source)
                          ? "text-ds-text-4 cursor-not-allowed opacity-50"
                          : "hover:bg-status-warn-soft text-status-warn-fg"
                      }`}
                      title={
                        isAuto(i.source)
                          ? "Auto-generado: elimina la fuente (puesto operativo, contrato, etc.)"
                          : "Eliminar"
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Tablet+: table */}
          <div className="hidden sm:block overflow-x-auto">
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
                {filtered.map((i) => (
                  <tr key={i.id} className="border-b border-border hover:bg-muted/20">
                    <td className="p-2">
                      <div className="font-medium">{i.name}</div>
                      {i.description && (
                        <div className="text-[12px] text-ds-text-3 truncate max-w-[260px]">
                          {i.description}
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-ds-text-2">{i.category.name}</td>
                    <td className="p-2 text-ds-text-2">{humanReadableRecurrence(i)}</td>
                    <td className="p-2 text-right font-mono">
                      {i.currency} {fmt.format(Number(i.amount))}
                    </td>
                    <td className="p-2 text-[12px]">
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
                            className="p-1.5 hover:bg-muted/40 rounded"
                            aria-label={isAuto(i.source) ? "Ver (solo lectura)" : "Editar"}
                            title={
                              isAuto(i.source)
                                ? "Auto-generado: solo puedes editar nombre/notas"
                                : "Editar"
                            }
                          >
                            {isAuto(i.source) ? (
                              <Lock className="h-3.5 w-3.5 text-ds-text-3" />
                            ) : (
                              <Pencil className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => !isAuto(i.source) && handleDelete(i.id)}
                            disabled={isAuto(i.source)}
                            className={`p-1.5 rounded ${
                              isAuto(i.source)
                                ? "text-ds-text-4 cursor-not-allowed opacity-40"
                                : "hover:bg-status-warn-soft text-status-warn-fg"
                            }`}
                            aria-label={isAuto(i.source) ? "No editable" : "Eliminar"}
                            title={
                              isAuto(i.source)
                                ? "Auto-generado: elimina la fuente original"
                                : "Eliminar"
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

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
