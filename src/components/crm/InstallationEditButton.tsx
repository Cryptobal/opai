/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { MapsUrlPasteInput } from "@/components/ui/MapsUrlPasteInput";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

export type InstallationForEdit = {
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

const inputClassName =
  "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";

export function InstallationEditButton({
  installation,
}: {
  installation: InstallationForEdit;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: installation.name,
    address: installation.address || "",
    city: installation.city || "",
    commune: installation.commune || "",
    lat: installation.lat ?? null,
    lng: installation.lng ?? null,
    notes: installation.notes || "",
  });

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

  const handleOpenChange = (next: boolean) => {
    if (!next) setOpen(false);
    else {
      setForm({
        name: installation.name,
        address: installation.address || "",
        city: installation.city || "",
        commune: installation.commune || "",
        lat: installation.lat ?? null,
        lng: installation.lng ?? null,
        notes: installation.notes || "",
      });
      setOpen(true);
    }
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    setLoading(true);
    try {
      const body = {
        ...form,
        lat: form.lat != null && (form.lat !== 0 || form.lng !== 0) ? form.lat : null,
        lng: form.lng != null && (form.lat !== 0 || form.lng !== 0) ? form.lng : null,
      };
      const response = await fetch(`/api/crm/installations/${installation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error);
      toast.success("Instalación actualizada");
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("No se pudo guardar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => handleOpenChange(true)}>
        <Pencil className="h-3.5 w-3.5 mr-1" />
        Editar
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar instalación</DialogTitle>
            <DialogDescription>
              Modifica nombre y dirección de la instalación.
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
              <MapsUrlPasteInput onResolve={handleAddressChange} />
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
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
