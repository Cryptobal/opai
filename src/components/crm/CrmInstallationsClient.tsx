/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import { Plus, Pencil, MapPin, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type InstallationRow = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  commune?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes?: string | null;
};

type FormState = {
  name: string;
  address: string;
  city: string;
  commune: string;
  lat: number | null;
  lng: number | null;
  notes: string;
};

const DEFAULT_FORM: FormState = {
  name: "",
  address: "",
  city: "",
  commune: "",
  lat: null,
  lng: null,
  notes: "",
};

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

export function CrmInstallationsClient({
  accountId,
  initialInstallations,
}: {
  accountId: string;
  initialInstallations: InstallationRow[];
}) {
  const [installations, setInstallations] = useState<InstallationRow[]>(initialInstallations);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const inputClassName =
    "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";

  const handleAddressChange = (result: AddressResult) => {
    setForm((prev) => ({
      ...prev,
      address: result.address,
      city: result.city || prev.city,
      commune: result.commune || prev.commune,
      lat: result.lat,
      lng: result.lng,
    }));
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setOpen(true);
  };

  const openEdit = (inst: InstallationRow) => {
    setEditingId(inst.id);
    setForm({
      name: inst.name,
      address: inst.address || "",
      city: inst.city || "",
      commune: inst.commune || "",
      lat: inst.lat ?? null,
      lng: inst.lng ?? null,
      notes: inst.notes || "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    setLoading(true);
    try {
      if (editingId) {
        const response = await fetch(`/api/crm/installations/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error);
        setInstallations((prev) =>
          prev.map((i) => (i.id === editingId ? payload.data : i))
        );
        toast.success("Instalación actualizada");
      } else {
        const response = await fetch("/api/crm/installations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, accountId }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error);
        setInstallations((prev) => [payload.data, ...prev]);
        toast.success("Instalación creada");
      }
      setOpen(false);
      setForm(DEFAULT_FORM);
      setEditingId(null);
    } catch (error) {
      console.error(error);
      toast.error("No se pudo guardar la instalación.");
    } finally {
      setLoading(false);
    }
  };

  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: "" });

  const deleteInstallation = async (id: string) => {
    try {
      const response = await fetch(`/api/crm/installations/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error();
      setInstallations((prev) => prev.filter((i) => i.id !== id));
      setDeleteConfirm({ open: false, id: "" });
      toast.success("Instalación eliminada");
    } catch {
      toast.error("No se pudo eliminar.");
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          {installations.length} instalación(es)
        </p>
        <Button size="sm" variant="secondary" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Nueva
        </Button>
      </div>

      {installations.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Sin instalaciones registradas.
        </p>
      )}

      <div className="space-y-3">
        {installations.map((inst) => (
          <div
            key={inst.id}
            className="rounded-lg border p-3 cursor-pointer hover:bg-accent/30 transition-colors"
            onClick={() => openEdit(inst)}
          >
            <div className="flex items-start gap-3">
              {/* Datos de la instalación (izquierda) */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{inst.name}</p>
                    {inst.address && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {inst.address}
                      </p>
                    )}
                    {(inst.city || inst.commune) && (
                      <p className="text-xs text-muted-foreground ml-4">
                        {[inst.commune, inst.city].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(inst)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteConfirm({ open: true, id: inst.id })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Mapa (derecha, tamaño acotado) */}
              {inst.lat != null && inst.lng != null && MAPS_KEY && (
                <a
                  href={`https://www.google.com/maps/@${inst.lat},${inst.lng},17z`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 block rounded overflow-hidden border border-border hover:opacity-90 transition-opacity w-[140px] h-[90px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://maps.googleapis.com/maps/api/staticmap?center=${inst.lat},${inst.lng}&zoom=15&size=280x180&scale=2&markers=color:red%7C${inst.lat},${inst.lng}&key=${MAPS_KEY}`}
                    alt={`Mapa ${inst.name}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar" : "Nueva"} instalación</DialogTitle>
            <DialogDescription>
              Agrega nombre y dirección de la instalación.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Planta Norte, Bodega Central..."
                className={inputClassName}
              />
            </div>
            <div className="space-y-2">
              <Label>Dirección</Label>
              <AddressAutocomplete
                value={form.address}
                onChange={handleAddressChange}
                placeholder="Buscar dirección en Google Maps..."
                showMap={true}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Ciudad</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                  placeholder="Santiago"
                  className={`${inputClassName} text-sm`}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Comuna</Label>
                <Input
                  value={form.commune}
                  onChange={(e) => setForm((p) => ({ ...p, commune: e.target.value }))}
                  placeholder="Providencia"
                  className={`${inputClassName} text-sm`}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Observaciones..."
                className={inputClassName}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(v) => setDeleteConfirm({ ...deleteConfirm, open: v })}
        title="Eliminar instalación"
        description="La instalación será eliminada permanentemente. Esta acción no se puede deshacer."
        onConfirm={() => deleteInstallation(deleteConfirm.id)}
      />
    </>
  );
}
