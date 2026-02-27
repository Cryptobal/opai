/**
 * CpqSimpleCatalogConfig
 * 
 * Componente reutilizable para configurar catálogos simples (Puestos, Cargos, Roles).
 * CRUD completo con tabla inline.
 */
"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Pencil, X, Check, Palette } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type CatalogEntry = {
  id: string;
  name: string;
  description?: string | null;
  colorHex?: string | null;
  patternWork?: number | null;
  patternOff?: number | null;
  active: boolean;
  createdAt: string;
};

interface CpqSimpleCatalogConfigProps {
  title: string;
  description: string;
  apiPath: string; // e.g. "/api/cpq/puestos"
  hasDescription?: boolean;
  hasPattern?: boolean;
}

export function CpqSimpleCatalogConfig({
  title,
  description,
  apiPath,
  hasDescription = false,
  hasPattern = false,
}: CpqSimpleCatalogConfigProps) {
  const [items, setItems] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColorHex, setNewColorHex] = useState("#64748b");
  const [newPatternWork, setNewPatternWork] = useState<string>("");
  const [newPatternOff, setNewPatternOff] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColorHex, setEditColorHex] = useState("#64748b");
  const [editPatternWork, setEditPatternWork] = useState<string>("");
  const [editPatternOff, setEditPatternOff] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<CatalogEntry | null>(null);
  const [saving, setSaving] = useState(false);

  const inputClass =
    "h-9 text-sm bg-card text-foreground border-border placeholder:text-muted-foreground";
  const colorInputClass =
    "h-9 w-10 cursor-pointer rounded-md border border-border bg-card p-1";

  const normalizeColorHex = (value: string): string | null => {
    const normalized = value.trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
  };

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiPath}?active=true`, { cache: "no-store" });
      const data = await res.json();
      if (data.success) setItems(data.data || []);
    } catch (error) {
      console.error(`Error loading ${title}:`, error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiPath]);

  const addItem = async () => {
    if (!newName.trim()) {
      toast.error("Escribe un nombre");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          colorHex: normalizeColorHex(newColorHex),
          ...(hasDescription ? { description: newDesc.trim() || null } : {}),
          ...(hasPattern && newPatternWork ? { patternWork: Number(newPatternWork) } : {}),
          ...(hasPattern && newPatternOff ? { patternOff: Number(newPatternOff) } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setItems((prev) => [...prev, data.data]);
        setNewName("");
        setNewDesc("");
        setNewColorHex("#64748b");
        setNewPatternWork("");
        setNewPatternOff("");
        toast.success("Agregado correctamente");
      } else {
        toast.error(data.error || "Error al agregar");
      }
    } catch {
      toast.error("Error al agregar");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${apiPath}/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          colorHex: normalizeColorHex(editColorHex),
          ...(hasDescription ? { description: editDesc.trim() || null } : {}),
          ...(hasPattern ? { patternWork: editPatternWork ? Number(editPatternWork) : null } : {}),
          ...(hasPattern ? { patternOff: editPatternOff ? Number(editPatternOff) : null } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setItems((prev) =>
          prev.map((item) => (item.id === editingId ? data.data : item))
        );
        setEditingId(null);
        toast.success("Guardado correctamente");
      } else {
        toast.error(data.error || "Error al guardar");
      }
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (item: CatalogEntry) => {
    setDeleteConfirm(null);
    setSaving(true);
    try {
      const res = await fetch(`${apiPath}/${item.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        toast.success("Eliminado correctamente");
      } else {
        toast.error(data.error || "Error al eliminar");
      }
    } catch {
      toast.error("Error al eliminar");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: CatalogEntry) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditDesc(item.description || "");
    setEditColorHex(item.colorHex || "#64748b");
    setEditPatternWork(item.patternWork != null ? String(item.patternWork) : "");
    setEditPatternOff(item.patternOff != null ? String(item.patternOff) : "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditDesc("");
    setEditColorHex("#64748b");
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 sm:p-4 border-border/40 bg-card/50">
        <div className="mb-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>

        {/* Add new item */}
        <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-border/30">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre"
            className={`${inputClass} flex-1`}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
          />
          {hasDescription && (
            <Input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Descripción (opcional)"
              className={`${inputClass} flex-1`}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
            />
          )}
          {hasPattern && (
            <>
              <Input
                type="number"
                min={1}
                max={30}
                value={newPatternWork}
                onChange={(e) => setNewPatternWork(e.target.value)}
                placeholder="Días trabajo"
                className={`${inputClass} w-28`}
              />
              <Input
                type="number"
                min={0}
                max={30}
                value={newPatternOff}
                onChange={(e) => setNewPatternOff(e.target.value)}
                placeholder="Días descanso"
                className={`${inputClass} w-28`}
              />
            </>
          )}
          <label
            className="flex items-center gap-1 rounded-md border border-border/60 px-2 h-9 text-xs text-muted-foreground"
            title="Color del badge"
          >
            <Palette className="h-3.5 w-3.5" />
            <input
              type="color"
              value={newColorHex}
              onChange={(e) => setNewColorHex(e.target.value)}
              className={colorInputClass}
              aria-label="Color del elemento"
            />
          </label>
          <Button
            size="sm"
            onClick={addItem}
            disabled={saving || !newName.trim()}
            className="h-9 gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Agregar</span>
          </Button>
        </div>

        {/* Items list */}
        {loading ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            Cargando...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            No hay elementos. Agrega el primero arriba.
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded-md border border-border/40 px-3 py-2 hover:bg-accent/30 transition-colors group"
              >
                {editingId === item.id ? (
                  <>
                    <input
                      type="color"
                      value={editColorHex}
                      onChange={(e) => setEditColorHex(e.target.value)}
                      className={colorInputClass}
                      aria-label="Color del elemento"
                    />
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className={`${inputClass} flex-1`}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                    />
                    {hasDescription && (
                      <Input
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        placeholder="Descripción"
                        className={`${inputClass} flex-1`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                    )}
                    {hasPattern && (
                      <>
                        <Input
                          type="number"
                          min={1}
                          max={30}
                          value={editPatternWork}
                          onChange={(e) => setEditPatternWork(e.target.value)}
                          placeholder="Trabajo"
                          className={`${inputClass} w-20`}
                        />
                        <Input
                          type="number"
                          min={0}
                          max={30}
                          value={editPatternOff}
                          onChange={(e) => setEditPatternOff(e.target.value)}
                          placeholder="Descanso"
                          className={`${inputClass} w-20`}
                        />
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-emerald-500"
                      onClick={saveEdit}
                      disabled={saving}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={cancelEdit}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-border/60 shrink-0"
                      style={{ backgroundColor: item.colorHex || "#64748b" }}
                      title={item.colorHex || "Sin color"}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {item.name}
                        {hasPattern && item.patternWork != null && item.patternOff != null && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({item.patternWork} trabajo, {item.patternOff} descanso)
                          </span>
                        )}
                      </p>
                      {hasDescription && item.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => startEdit(item)}
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive"
                        onClick={() => setDeleteConfirm(item)}
                        title="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar eliminación</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar{" "}
              <strong>&quot;{deleteConfirm?.name}&quot;</strong>? Los registros
              existentes que usan este elemento no se verán afectados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteItem(deleteConfirm)}
              disabled={saving}
            >
              {saving ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
