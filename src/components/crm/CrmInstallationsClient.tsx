/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useState } from "react";
import Link from "next/link";
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
import { Plus, MapPin, Loader2 } from "lucide-react";
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
  isActive?: boolean;
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
  accountIsActive,
  initialInstallations,
}: {
  accountId: string;
  accountIsActive: boolean;
  initialInstallations: InstallationRow[];
}) {
  const [installations, setInstallations] = useState<InstallationRow[]>(initialInstallations);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [statusUpdatingIds, setStatusUpdatingIds] = useState<Set<string>>(new Set());
  const [accountActiveState, setAccountActiveState] = useState(accountIsActive);
  const [statusConfirm, setStatusConfirm] = useState<{ open: boolean; id: string; next: boolean; activateAccount: boolean }>({
    open: false,
    id: "",
    next: false,
    activateAccount: false,
  });

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
    setForm(DEFAULT_FORM);
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/crm/installations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, accountId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error);
      setInstallations((prev) => [payload.data, ...prev]);
      setOpen(false);
      setForm(DEFAULT_FORM);
      toast.success("Instalación creada");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo guardar la instalación.");
    } finally {
      setLoading(false);
    }
  };

  const openToggleInstallationStatus = (inst: InstallationRow) => {
    const current = inst.isActive === true;
    const next = !current;
    setStatusConfirm({
      open: true,
      id: inst.id,
      next,
      activateAccount: next && accountActiveState === false,
    });
  };

  const toggleInstallationStatus = async () => {
    const inst = installations.find((row) => row.id === statusConfirm.id);
    if (!inst) return;
    setStatusUpdatingIds((prev) => new Set(prev).add(inst.id));
    try {
      const response = await fetch(`/api/crm/installations/${inst.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: statusConfirm.next,
          activateAccount: Boolean(statusConfirm.activateAccount),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload?.error || "No se pudo actualizar");

      setInstallations((prev) => prev.map((i) => (i.id === inst.id ? payload.data : i)));
      if (payload.data?.account?.isActive === true) setAccountActiveState(true);
      setStatusConfirm({ open: false, id: "", next: false, activateAccount: false });
      toast.success(statusConfirm.next ? "Instalación activada" : "Instalación desactivada");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo cambiar el estado de la instalación.");
    } finally {
      setStatusUpdatingIds((prev) => {
        const nextSet = new Set(prev);
        nextSet.delete(inst.id);
        return nextSet;
      });
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
          <div key={inst.id} className="rounded-lg border p-3 hover:bg-accent/30 transition-colors">
            <div className="flex items-start gap-3">
              {/* Datos de la instalación (clickeable → ficha) */}
              <Link
                href={`/crm/installations/${inst.id}`}
                className="flex-1 min-w-0 group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                        {inst.name}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          inst.isActive
                            ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            : "border border-amber-500/30 bg-amber-500/10 text-amber-300"
                        }`}
                      >
                        {inst.isActive ? "Activa" : "Inactiva"}
                      </span>
                    </div>
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
                </div>
              </Link>

              {/* Mapa (derecha) */}
              {inst.lat != null && inst.lng != null && MAPS_KEY && (
                <Link
                  href={`/crm/installations/${inst.id}`}
                  className="shrink-0 block rounded overflow-hidden border border-border hover:opacity-90 transition-opacity w-[100px] h-[70px] sm:w-[140px] sm:h-[90px]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://maps.googleapis.com/maps/api/staticmap?center=${inst.lat},${inst.lng}&zoom=15&size=280x180&scale=2&markers=color:red%7C${inst.lat},${inst.lng}&key=${MAPS_KEY}`}
                    alt={`Mapa ${inst.name}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </Link>
              )}
            </div>
            <div className="mt-3 flex items-center justify-end gap-2 border-t pt-2">
              <Button
                size="sm"
                variant={inst.isActive ? "outline" : "secondary"}
                className="h-8"
                onClick={() => openToggleInstallationStatus(inst)}
                disabled={statusUpdatingIds.has(inst.id)}
              >
                {statusUpdatingIds.has(inst.id)
                  ? "Guardando..."
                  : inst.isActive
                  ? "Desactivar"
                  : "Activar"}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva instalación</DialogTitle>
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
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={statusConfirm.open}
        onOpenChange={(open) => setStatusConfirm((prev) => ({ ...prev, open }))}
        title={statusConfirm.next ? "Activar instalación" : "Desactivar instalación"}
        description={
          statusConfirm.next
            ? statusConfirm.activateAccount
              ? "La instalación quedará activa y también se activará la cuenta asociada."
              : "La instalación quedará activa."
            : "La instalación quedará inactiva."
        }
        confirmLabel={statusConfirm.next ? "Activar" : "Desactivar"}
        variant="default"
        onConfirm={toggleInstallationStatus}
      />
    </>
  );
}
