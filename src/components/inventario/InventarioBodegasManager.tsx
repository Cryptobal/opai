"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { OpaiSurface } from "@/components/opai";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
  User,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Warehouse = {
  id: string;
  name: string;
  type: "central" | "supervisor" | "installation" | "other";
  active: boolean;
  notes?: string | null;
  supervisor?: { id: string; name: string; email?: string | null } | null;
  installation?: { id: string; name: string } | null;
  supervisorId?: string | null;
  installationId?: string | null;
};

type AdminOption = { id: string; name: string };
type InstallationOption = { id: string; name: string };

interface Props {
  canDelete: boolean;
}

const TYPE_META: Record<Warehouse["type"], { label: string; icon: typeof WarehouseIcon }> = {
  central: { label: "Central", icon: WarehouseIcon },
  supervisor: { label: "Supervisor", icon: User },
  installation: { label: "Instalación", icon: Building2 },
  other: { label: "Otro", icon: MapPin },
};

type FormState = {
  name: string;
  type: Warehouse["type"];
  active: boolean;
  supervisorId: string;
  installationId: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  type: "central",
  active: true,
  supervisorId: "",
  installationId: "",
  notes: "",
};

export function InventarioBodegasManager({ canDelete }: Props) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [admins, setAdmins] = useState<AdminOption[]>([]);
  const [installations, setInstallations] = useState<InstallationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | Warehouse["type"]>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const fetchWarehouses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (showInactive) params.set("includeInactive", "true");
      const res = await fetch(`/api/ops/inventario/warehouses?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (Array.isArray(data)) setWarehouses(data);
    } catch (err) {
      console.error("[bodegas] fetch", err);
      toast.error("No se pudieron cargar las bodegas");
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    void fetchWarehouses();
  }, [fetchWarehouses]);

  // Carga lazy de selects (admins / instalaciones) la primera vez que se abre el sheet.
  const ensureSelectOptions = useCallback(async () => {
    if (admins.length === 0) {
      try {
        const res = await fetch("/api/ops/admins", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data) ? data : data?.data ?? [];
          setAdmins(
            items
              .filter((u: { id?: string; name?: string | null }) => u?.id && u?.name)
              .map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })),
          );
        }
      } catch {
        /* noop */
      }
    }
    if (installations.length === 0) {
      try {
        const res = await fetch("/api/crm/installations", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data) ? data : data?.data ?? [];
          setInstallations(
            items
              .filter((i: { id?: string; name?: string | null }) => i?.id && i?.name)
              .map((i: { id: string; name: string }) => ({ id: i.id, name: i.name })),
          );
        }
      } catch {
        /* noop */
      }
    }
  }, [admins.length, installations.length]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return warehouses.filter((w) => {
      if (typeFilter !== "all" && w.type !== typeFilter) return false;
      if (!q) return true;
      return (
        w.name.toLowerCase().includes(q) ||
        w.supervisor?.name.toLowerCase().includes(q) ||
        w.installation?.name.toLowerCase().includes(q)
      );
    });
  }, [warehouses, search, typeFilter]);

  const counts = useMemo(() => {
    const all = warehouses.length;
    const central = warehouses.filter((w) => w.type === "central").length;
    const sup = warehouses.filter((w) => w.type === "supervisor").length;
    const inst = warehouses.filter((w) => w.type === "installation").length;
    const other = warehouses.filter((w) => w.type === "other").length;
    return { all, central, supervisor: sup, installation: inst, other };
  }, [warehouses]);

  const openNew = async () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSheetOpen(true);
    await ensureSelectOptions();
  };

  const openEdit = async (w: Warehouse) => {
    setEditingId(w.id);
    setForm({
      name: w.name,
      type: w.type,
      active: w.active,
      supervisorId: w.supervisorId ?? "",
      installationId: w.installationId ?? "",
      notes: w.notes ?? "",
    });
    setSheetOpen(true);
    await ensureSelectOptions();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Falta el nombre de la bodega");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        type: form.type,
        active: form.active,
        supervisorId: form.type === "supervisor" ? form.supervisorId || null : null,
        installationId: form.type === "installation" ? form.installationId || null : null,
        notes: form.notes.trim() || null,
      };
      const url = editingId
        ? `/api/ops/inventario/warehouses/${editingId}`
        : `/api/ops/inventario/warehouses`;
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "No se pudo guardar");
      }
      toast.success(editingId ? "Bodega actualizada" : "Bodega creada");
      setSheetOpen(false);
      await fetchWarehouses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (w: Warehouse) => {
    try {
      const res = await fetch(`/api/ops/inventario/warehouses/${w.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !w.active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "No se pudo cambiar el estado");
      }
      toast.success(w.active ? "Bodega desactivada" : "Bodega reactivada");
      await fetchWarehouses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const handleDelete = async (w: Warehouse) => {
    if (!window.confirm(`¿Eliminar la bodega "${w.name}"? Solo se permite si no tiene stock ni movimientos.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/ops/inventario/warehouses/${w.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "No se pudo eliminar");
      }
      toast.success("Bodega eliminada");
      await fetchWarehouses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center min-w-0">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar bodega…"
              className="pl-8 h-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
            <SelectTrigger className="h-9 w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos ({counts.all})</SelectItem>
              <SelectItem value="central">Central ({counts.central})</SelectItem>
              <SelectItem value="supervisor">Supervisor ({counts.supervisor})</SelectItem>
              <SelectItem value="installation">Instalación ({counts.installation})</SelectItem>
              <SelectItem value="other">Otro ({counts.other})</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground sm:ml-2">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Mostrar inactivas
          </label>
        </div>
        <Button size="sm" variant="outline" className="gap-2" onClick={openNew}>
          <Plus className="h-4 w-4" /> Nueva bodega
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando bodegas…
        </div>
      ) : filtered.length === 0 ? (
        <OpaiSurface className="py-10 text-center">
          <WarehouseIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">Sin bodegas</p>
          <p className="text-xs text-muted-foreground mt-1">
            {search || typeFilter !== "all"
              ? "Ninguna coincide con el filtro actual."
              : "Crea la primera bodega para registrar stock."}
          </p>
        </OpaiSurface>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((w) => {
            const meta = TYPE_META[w.type];
            const Icon = meta.icon;
            return (
              <OpaiSurface
                key={w.id}
                hoverable
                className={cn("flex flex-col gap-2", !w.active && "opacity-60")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{w.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider border-foreground/10 bg-foreground/5 text-muted-foreground">
                          {meta.label}
                        </Badge>
                        {!w.active && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            Inactiva
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {(w.supervisor || w.installation || w.notes) && (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {w.supervisor && (
                      <div className="flex items-center gap-1.5 truncate">
                        <User className="h-3 w-3 shrink-0" />
                        <span className="truncate">{w.supervisor.name}</span>
                      </div>
                    )}
                    {w.installation && (
                      <div className="flex items-center gap-1.5 truncate">
                        <Building2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">{w.installation.name}</span>
                      </div>
                    )}
                    {w.notes && (
                      <p className="line-clamp-2 text-[11px] text-muted-foreground/80">{w.notes}</p>
                    )}
                  </div>
                )}

                <div className="mt-1 flex items-center gap-1 border-t border-foreground/[0.06] pt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 flex-1 gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => openEdit(w)}
                  >
                    <Pencil className="h-3 w-3" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 flex-1 gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => handleToggleActive(w)}
                  >
                    <Power className="h-3 w-3" />
                    {w.active ? "Desactivar" : "Reactivar"}
                  </Button>
                  {canDelete && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDelete(w)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </OpaiSurface>
            );
          })}
        </div>
      )}

      {/* Sheet de edición */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>{editingId ? "Editar bodega" : "Nueva bodega"}</SheetTitle>
            <SheetDescription>
              Configura una bodega virtual para almacenar stock de uniformes y activos.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="bodega-name">Nombre *</Label>
              <Input
                id="bodega-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Bodega central, Supervisor Juan"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as Warehouse["type"] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="central">Central</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="installation">Instalación</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.type === "supervisor" && (
              <div className="space-y-1.5">
                <Label>Supervisor asignado</Label>
                <Select
                  value={form.supervisorId || "none"}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, supervisorId: v === "none" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {admins.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.type === "installation" && (
              <div className="space-y-1.5">
                <Label>Instalación asociada</Label>
                <Select
                  value={form.installationId || "none"}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, installationId: v === "none" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sin asignar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {installations.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="bodega-notes">Notas</Label>
              <textarea
                id="bodega-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Comentarios u observaciones (opcional)"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              <span>Bodega activa</span>
            </label>

            <SheetFooter className="flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                {editingId ? "Guardar cambios" : "Crear bodega"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
