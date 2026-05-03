"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CostCategory {
  id: string;
  tenantId: string | null;
  name: string;
  slug: string;
  type: string;
  icon: string | null;
  sortOrder: number;
  active: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  direct: "DIRECTOS",
  indirect: "INDIRECTOS",
};

const ICON_OPTIONS = [
  { value: "shirt", label: "👔 Uniformes" },
  { value: "stethoscope", label: "🏥 Exámenes" },
  { value: "utensils", label: "🍽 Alimentación" },
  { value: "calendar", label: "📅 Feriados" },
  { value: "graduation-cap", label: "🎓 Capacitación" },
  { value: "shield", label: "🛡 Seguros" },
  { value: "radio", label: "📻 Equipo operativo" },
  { value: "laptop", label: "💻 Tecnología" },
  { value: "truck", label: "🚛 Transporte" },
  { value: "car", label: "🚙 Vehículos" },
  { value: "building", label: "🏗 Infraestructura" },
  { value: "signal", label: "📡 Comunicaciones" },
  { value: "eye", label: "👁 Supervisión" },
  { value: "clipboard", label: "📋 Administración" },
  { value: "box", label: "📦 Otro" },
];

const ICON_EMOJI: Record<string, string> = Object.fromEntries(
  ICON_OPTIONS.map((o) => [o.value, o.label.split(" ")[0]])
);

export function CpqCostCategoryConfig() {
  const [categories, setCategories] = useState<CostCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editCat, setEditCat] = useState<CostCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    slug: "",
    type: "direct",
    icon: "box",
    sortOrder: 0,
  });

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cpq/cost-categories", { cache: "no-store" });
      const data = await res.json();
      if (data.success) setCategories(data.data ?? []);
    } catch {
      toast.error("Error al cargar categorías");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCategories(); }, []);

  const openEdit = (c: CostCategory) => {
    setEditCat(c);
    setShowNew(false);
    setEditForm({
      name: c.name,
      slug: c.slug,
      type: c.type,
      icon: c.icon ?? "box",
      sortOrder: c.sortOrder,
    });
  };

  const openNew = () => {
    setEditCat(null);
    setShowNew(true);
    setEditForm({ name: "", slug: "", type: "direct", icon: "box", sortOrder: categories.length });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editCat) {
        const res = await fetch(`/api/cpq/cost-categories/${editCat.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editForm.name,
            icon: editForm.icon,
            sortOrder: editForm.sortOrder,
            active: true,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        toast.success("Categoría actualizada");
      } else {
        const slug = editForm.slug || editForm.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        const res = await fetch("/api/cpq/cost-categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editForm.name,
            slug,
            type: editForm.type,
            icon: editForm.icon,
            sortOrder: editForm.sortOrder,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        toast.success("Categoría creada");
      }
      setEditCat(null);
      setShowNew(false);
      fetchCategories();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al guardar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const grouped = {
    direct: categories.filter((c) => c.type === "direct"),
    indirect: categories.filter((c) => c.type !== "direct"),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Categorías de Costos</h2>
          <p className="text-xs text-muted-foreground">
            Organiza los costos en categorías para el desglose en propuestas detalladas.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={openNew}>
          <Plus className="h-3.5 w-3.5" />
          Nueva categoría
        </Button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando categorías...
        </div>
      )}

      {(["direct", "indirect"] as const).map((type) => {
        const cats = grouped[type];
        if (!cats.length && !loading) return null;
        return (
          <Card key={type} className="p-3 sm:p-4 space-y-2 border-border/40 bg-card/50">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {TYPE_LABELS[type]}
            </h3>
            <div className="space-y-1">
              {cats.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-md border px-3 py-2",
                    c.active ? "border-border/40" : "border-border/20 opacity-50",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="text-base shrink-0">{ICON_EMOJI[c.icon ?? "box"] ?? "📦"}</span>
                    <span className="text-sm font-medium break-words">{c.name}</span>
                    <span className="text-xs text-muted-foreground break-all">{c.slug}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 shrink-0"
                    onClick={() => openEdit(c)}
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {cats.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">Sin categorías en este tipo.</p>
              )}
            </div>
          </Card>
        );
      })}

      {/* Edit / New dialog */}
      <Dialog open={!!editCat || showNew} onOpenChange={(o) => { if (!o) { setEditCat(null); setShowNew(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editCat ? `Editar: ${editCat.name}` : "Nueva categoría"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Nombre</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                className="h-9 text-sm"
                placeholder="Nombre de la categoría"
              />
            </div>
            {!editCat && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Slug</label>
                  <Input
                    value={editForm.slug}
                    onChange={(e) => setEditForm((p) => ({ ...p, slug: e.target.value }))}
                    className="h-9 text-sm"
                    placeholder="slug-unico"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Tipo</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
                    value={editForm.type}
                    onChange={(e) => setEditForm((p) => ({ ...p, type: e.target.value }))}
                  >
                    <option value="direct">Directo</option>
                    <option value="indirect">Indirecto</option>
                  </select>
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Icono</label>
                <select
                  className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
                  value={editForm.icon}
                  onChange={(e) => setEditForm((p) => ({ ...p, icon: e.target.value }))}
                >
                  {ICON_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Orden</label>
                <Input
                  type="number"
                  value={editForm.sortOrder}
                  onChange={(e) => setEditForm((p) => ({ ...p, sortOrder: Number(e.target.value) || 0 }))}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditCat(null); setShowNew(false); }}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !editForm.name.trim()}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
