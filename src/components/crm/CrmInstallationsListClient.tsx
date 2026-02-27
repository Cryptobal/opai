"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { MapPin, Search, ChevronRight, Plus, Loader2, Moon, ShieldAlert, Users, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/opai/EmptyState";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import { MapsUrlPasteInput } from "@/components/ui/MapsUrlPasteInput";
import { CrmDates } from "@/components/crm/CrmDates";
import { ViewToggle, type ViewMode } from "@/components/shared/ViewToggle";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useUnreadNoteIds } from "@/lib/hooks";

export type InstallationRow = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  commune?: string | null;
  lat?: number | null;
  lng?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  isActive?: boolean;
  nocturnoEnabled?: boolean;
  totalSlots?: number;
  assignedGuards?: number;
  account?: { id: string; name: string; type?: "prospect" | "client"; status?: string; isActive?: boolean } | null;
};

type AccountOption = { id: string; name: string };

type FormState = {
  accountId: string;
  name: string;
  address: string;
  city: string;
  commune: string;
  lat: number | null;
  lng: number | null;
  notes: string;
};

const DEFAULT_FORM: FormState = {
  accountId: "",
  name: "",
  address: "",
  city: "",
  commune: "",
  lat: null,
  lng: null,
  notes: "",
};

export function CrmInstallationsListClient({
  initialInstallations,
  accounts = [],
}: {
  initialInstallations: InstallationRow[];
  accounts?: AccountOption[];
}) {
  const router = useRouter();
  const [installations, setInstallations] = useState<InstallationRow[]>(initialInstallations);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>("cards");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const unreadNoteIds = useUnreadNoteIds("INSTALLATION");

  // Create form state
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);

  const inputCn = "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";
  const selectCn = "flex h-9 min-h-[44px] w-full appearance-none rounded-md border border-input bg-background pl-3 pr-8 py-2 text-sm text-foreground bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  useEffect(() => {
    if (open) setForm(DEFAULT_FORM);
  }, [open]);

  const filteredInstallations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return installations.filter((inst) => {
      if (statusFilter === "active" && inst.isActive !== true) return false;
      if (statusFilter === "inactive" && inst.isActive !== false) return false;
      if (q) {
        const searchable = `${inst.name} ${inst.address || ""} ${inst.city || ""} ${inst.commune || ""} ${inst.account?.name || ""}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [installations, search, statusFilter]);

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

  const createInstallation = async () => {
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    if (!form.accountId) {
      toast.error("Selecciona una cuenta.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/crm/installations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          lat: form.lat ?? undefined,
          lng: form.lng ?? undefined,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Error al crear instalación");
      toast.success("Instalación creada");
      setOpen(false);
      setForm(DEFAULT_FORM);
      // Refresh to get full data with account relation
      router.refresh();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo crear la instalación.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Search + Filters + Create ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, dirección o cuenta..."
            className={`pl-9 h-9 ${inputCn}`}
          />
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          {/* Status filter */}
          <div className="flex gap-1 shrink-0">
            {([
              { key: "all", label: "Todas" },
              { key: "active", label: "Activas" },
              { key: "inactive", label: "Inactivas" },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setStatusFilter(opt.key)}
                className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors shrink-0 ${
                  statusFilter === opt.key
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* ── Botón + crear instalación ── */}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="secondary" className="h-9 w-9 shrink-0">
                <Plus className="h-4 w-4" />
                <span className="sr-only">Nueva instalación</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Nueva instalación</DialogTitle>
                <DialogDescription>
                  Crea una nueva sede o ubicación asociada a una cuenta.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Cuenta *</Label>
                  <select
                    className={selectCn}
                    value={form.accountId}
                    onChange={(e) => setForm((p) => ({ ...p, accountId: e.target.value }))}
                    disabled={loading}
                  >
                    <option value="">Selecciona cuenta</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Nombre *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Ej: Planta Norte, Bodega Central..."
                    className={inputCn}
                    disabled={loading}
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
                  <MapsUrlPasteInput onResolve={handleAddressChange} disabled={loading} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Ciudad</Label>
                    <Input
                      value={form.city}
                      onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                      placeholder="Santiago"
                      className={`${inputCn} text-sm`}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Comuna</Label>
                    <Input
                      value={form.commune}
                      onChange={(e) => setForm((p) => ({ ...p, commune: e.target.value }))}
                      placeholder="Providencia"
                      className={`${inputCn} text-sm`}
                      disabled={loading}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notas</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Observaciones..."
                    className={inputCn}
                    disabled={loading}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                  Cancelar
                </Button>
                <Button onClick={createInstallation} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Crear
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Installation list ── */}
      <Card>
        <CardContent className="pt-5">
          {filteredInstallations.length === 0 ? (
            <EmptyState
              icon={<MapPin className="h-8 w-8" />}
              title="Sin instalaciones"
              description={
                search || statusFilter !== "all"
                  ? "No hay instalaciones para los filtros seleccionados."
                  : "No hay instalaciones registradas. Usa el botón + para crear una."
              }
              compact
            />
          ) : view === "list" ? (
            <div className="space-y-2">
              {filteredInstallations.map((inst) => (
                <Link
                  key={inst.id}
                  href={`/crm/installations/${inst.id}`}
                  className="flex items-center gap-2 rounded-lg border p-3 sm:p-4 transition-colors group hover:bg-accent/30"
                >
                  <div className="flex flex-1 items-center justify-between min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">{inst.name}</p>
                        {unreadNoteIds.has(inst.id) && (
                          <span className="relative shrink-0" title="Notas no leídas">
                            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive" />
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            inst.isActive === true
                              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                              : "border border-amber-500/30 bg-amber-500/10 text-amber-300"
                          }`}
                        >
                          {inst.isActive ? "Activa" : "Inactiva"}
                        </span>
                        {inst.nocturnoEnabled !== false && (
                          <span title="Control nocturno activo"><Moon className="h-3.5 w-3.5 text-indigo-400" /></span>
                        )}
                        {inst.isActive && (inst.totalSlots ?? 0) > 0 ? (
                          <>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5" title="Guardias asignados / Slots requeridos">
                              <Users className="h-3 w-3" />
                              {inst.assignedGuards ?? 0}/{inst.totalSlots}
                            </span>
                            {(inst.totalSlots! - (inst.assignedGuards ?? 0)) > 0 && (
                              <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold border border-red-500/30 bg-red-500/10 text-red-400" title="Puestos por cubrir">
                                {inst.totalSlots! - (inst.assignedGuards ?? 0)} PPC
                              </span>
                            )}
                          </>
                        ) : inst.isActive && (inst.totalSlots ?? 0) === 0 ? (
                          <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold border border-amber-500/30 bg-amber-500/10 text-amber-400">Sin puestos</span>
                        ) : null}
                      </div>
                      {inst.account && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{inst.account.name}</p>
                      )}
                      {inst.address && (
                        <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {inst.address}
                          {(inst.city || inst.commune) && (
                            <span> · {[inst.commune, inst.city].filter(Boolean).join(", ")}</span>
                          )}
                        </p>
                      )}
                      {inst.createdAt && (
                        <CrmDates createdAt={inst.createdAt} updatedAt={inst.updatedAt} className="mt-0.5" />
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 shrink-0 ml-2" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
              {filteredInstallations.map((inst) => (
                <Link
                  key={inst.id}
                  href={`/crm/installations/${inst.id}`}
                  className="rounded-lg border transition-colors hover:border-primary/30 group hover:bg-accent/30 block min-w-0 overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-2 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                          <MapPin className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm group-hover:text-primary transition-colors truncate">{inst.name}</p>
                            {unreadNoteIds.has(inst.id) && (
                              <span className="relative shrink-0" title="Notas no leídas">
                                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive" />
                              </span>
                            )}
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                inst.isActive === true
                                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                  : "border border-amber-500/30 bg-amber-500/10 text-amber-300"
                              }`}
                            >
                              {inst.isActive ? "Activa" : "Inactiva"}
                            </span>
                            {inst.nocturnoEnabled !== false && (
                              <span title="Control nocturno activo"><Moon className="h-3.5 w-3.5 text-indigo-400" /></span>
                            )}
                          </div>
                          {inst.account && <p className="text-[11px] text-muted-foreground">{inst.account.name}</p>}
                        </div>
                      </div>
                      {inst.address && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-2">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {inst.address}
                        </p>
                      )}
                      {(inst.commune || inst.city) && (
                        <p className="text-xs text-muted-foreground">
                          {[inst.commune, inst.city].filter(Boolean).join(", ")}
                        </p>
                      )}
                      {inst.isActive && (inst.totalSlots ?? 0) > 0 ? (
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1" title="Guardias asignados / Slots requeridos">
                            <Users className="h-3 w-3" />
                            {inst.assignedGuards ?? 0}/{inst.totalSlots} guardias
                          </span>
                          {(inst.totalSlots! - (inst.assignedGuards ?? 0)) > 0 && (
                            <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold border border-red-500/30 bg-red-500/10 text-red-400" title="Puestos por cubrir">
                              <ShieldAlert className="h-2.5 w-2.5 inline mr-0.5" />
                              {inst.totalSlots! - (inst.assignedGuards ?? 0)} PPC
                            </span>
                          )}
                        </div>
                      ) : inst.isActive && (inst.totalSlots ?? 0) === 0 ? (
                        <div className="mt-2 pt-2 border-t border-border/50">
                          <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold border border-amber-500/30 bg-amber-500/10 text-amber-400">Sin puestos creados</span>
                        </div>
                      ) : null}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
