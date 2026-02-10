"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DOC_CATEGORIES, DOC_MODULES } from "@/lib/docs/token-registry";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, Download } from "lucide-react";

type DocCategoryRow = {
  id: string;
  module: string;
  key: string;
  label: string;
  sortOrder: number;
};

const MODULE_LABELS: Record<string, string> = Object.fromEntries(
  DOC_MODULES.map((m) => [m.key, m.label])
);

export function DocCategoriesClient() {
  const [categories, setCategories] = useState<DocCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [seedLoading, setSeedLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formModule, setFormModule] = useState("crm");
  const [formKey, setFormKey] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/docs/categories", { cache: "no-store" });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setCategories(data.data);
      }
    } catch (e) {
      console.error(e);
      toast.error("Error al cargar categorías");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const openCreate = (module?: string) => {
    setEditingId(null);
    setFormModule(module || "crm");
    setFormKey("");
    setFormLabel("");
    setDialogOpen(true);
  };

  const openEdit = (row: DocCategoryRow) => {
    setEditingId(row.id);
    setFormModule(row.module);
    setFormKey(row.key);
    setFormLabel(row.label);
    setDialogOpen(true);
  };

  const saveCategory = async () => {
    const key = formKey.trim().toLowerCase().replace(/\s+/g, "_");
    const label = formLabel.trim();
    if (!label) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (!/^[a-z0-9_]+$/.test(key)) {
      toast.error("Clave: solo minúsculas, números y _");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/docs/categories/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al actualizar");
        setCategories((prev) =>
          prev.map((c) => (c.id === editingId ? { ...c, label } : c))
        );
        toast.success("Categoría actualizada");
      } else {
        const res = await fetch("/api/docs/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            module: formModule,
            key,
            label,
            sortOrder: categories.filter((c) => c.module === formModule).length,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.debug ?? data.error ?? "Error al crear");
        setCategories((prev) => [...prev, data.data]);
        toast.success("Categoría creada");
      }
      setDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (id: string) => {
    if (!confirm("¿Eliminar esta categoría? Las plantillas que la usen seguirán existiendo.")) return;
    try {
      const res = await fetch(`/api/docs/categories/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al eliminar");
      }
      setCategories((prev) => prev.filter((c) => c.id !== id));
      toast.success("Categoría eliminada");
    } catch (e: any) {
      toast.error(e.message || "Error al eliminar");
    }
  };

  const seedDefaults = async () => {
    setSeedLoading(true);
    try {
      let created = 0;
      for (const [module, items] of Object.entries(DOC_CATEGORIES).filter(([m]) => m !== "whatsapp")) {
        for (let i = 0; i < items.length; i++) {
          const { key, label } = items[i];
          const res = await fetch("/api/docs/categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ module, key, label, sortOrder: i }),
          });
          const data = await res.json();
          if (res.ok) created++;
          else if (data.error?.includes("Ya existe")) continue;
          else throw new Error(data.error || "Error al crear");
        }
      }
      await fetchCategories();
      toast.success(created > 0 ? `Se cargaron ${created} categorías por defecto` : "Ya existían todas las categorías");
    } catch (e: any) {
      toast.error(e.message || "Error al cargar por defecto");
    } finally {
      setSeedLoading(false);
    }
  };

  const byModule = categories.reduce(
    (acc, c) => {
      if (!acc[c.module]) acc[c.module] = [];
      acc[c.module].push(c);
      return acc;
    },
    {} as Record<string, DocCategoryRow[]>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => openCreate()} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Nueva categoría
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={seedDefaults}
          disabled={seedLoading}
          className="gap-1.5"
        >
          {seedLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Cargar categorías por defecto
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {DOC_MODULES.filter(({ key }) => key !== "whatsapp").map(({ key: modKey, label: modLabel }) => (
            <Card key={modKey}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{modLabel}</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => openCreate(modKey)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Añadir
                  </Button>
                </div>
                <CardDescription>
                  Categorías para plantillas del módulo {modLabel}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(!byModule[modKey] || byModule[modKey].length === 0) ? (
                  <p className="text-sm text-muted-foreground">Sin categorías. Añade una o carga por defecto.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {byModule[modKey]
                      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
                      .map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
                        >
                          <span className="font-medium">{c.label}</span>
                          <span className="text-xs text-muted-foreground">{c.key}</span>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => openEdit(c)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive"
                              onClick={() => deleteCategory(c.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar categoría" : "Nueva categoría"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Módulo</Label>
              <Select
                value={formModule}
                onValueChange={setFormModule}
                disabled={!!editingId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_MODULES.filter((m) => m.key !== "whatsapp").map((m) => (
                    <SelectItem key={m.key} value={m.key}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Clave (solo minúsculas, números y _)</Label>
              <Input
                value={formKey}
                onChange={(e) => setFormKey(e.target.value)}
                placeholder="ej: email_seguimiento"
                disabled={!!editingId}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Nombre visible</Label>
              <Input
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="Ej: Email de Seguimiento"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveCategory} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingId ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
