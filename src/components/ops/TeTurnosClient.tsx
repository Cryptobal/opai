"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState, StatusBadge } from "@/components/opai";
import { Clock3, FileDown, Plus, Search } from "lucide-react";

type TeItem = {
  id: string;
  date: string;
  status: string;
  amountClp: number | string;
  tipo?: string;
  isManual?: boolean;
  horasExtra?: number | string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  paidAt?: string | null;
  installation?: { id: string; name: string } | null;
  puesto?: { id: string; name: string } | null;
  guardia: {
    id: string;
    code?: string | null;
    persona: {
      firstName: string;
      lastName: string;
      rut?: string | null;
    };
  };
  paymentItems?: Array<{ id: string; loteId: string; amountClp: number | string; status: string }>;
};

interface TeTurnosClientProps {
  initialItems: TeItem[];
  defaultStatusFilter?: string;
}

function toNumber(value: number | string): number {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateLabel(value: string): string {
  return new Date(value).toLocaleDateString("es-CL");
}

export function TeTurnosClient({
  initialItems,
  defaultStatusFilter = "all",
}: TeTurnosClientProps) {
  const [items, setItems] = useState<TeItem[]>(initialItems);
  const [statusFilter, setStatusFilter] = useState<string>(defaultStatusFilter);
  const [search, setSearch] = useState<string>("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generatingPlantilla, setGeneratingPlantilla] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [aprobarModal, setAprobarModal] = useState<{ item: TeItem; amountClp: string } | null>(null);

  // Modal crear TE/HE
  const [clients, setClients] = useState<Array<{ id: string; name: string; installations: Array<{ id: string; name: string; teMontoClp?: number | string | null }> }>>([]);
  const [puestos, setPuestos] = useState<Array<{ id: string; name: string; teMontoClp?: number | string | null }>>([]);
  const [guardias, setGuardias] = useState<Array<{ id: string; code?: string | null; persona: { firstName: string; lastName: string; rut?: string | null } }>>([]);
  const [createForm, setCreateForm] = useState({
    clientId: "",
    installationId: "",
    puestoId: "",
    guardiaId: "",
    date: new Date().toISOString().slice(0, 10),
    tipo: "turno_extra" as "turno_extra" | "hora_extra",
    amountClp: "",
    horasExtra: "",
    notes: "",
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const canAddToLote = (item: TeItem) =>
    item.status === "approved" && (!item.paymentItems || item.paymentItems.length === 0);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllApproved = () => {
    const approved = filtered.filter(canAddToLote).map((i) => i.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      approved.forEach((id) => next.add(id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (query) {
        const haystack =
          `${item.installation?.name ?? ""} ${item.puesto?.name ?? ""} ${item.guardia.persona.firstName} ${item.guardia.persona.lastName} ${item.guardia.persona.rut ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [items, search, statusFilter]);

  const patch = async (
    id: string,
    action: "aprobar" | "rechazar",
    opts?: { reason?: string; amountClp?: number }
  ) => {
    setUpdatingId(id);
    try {
      const body: Record<string, unknown> =
        action === "rechazar" ? { reason: opts?.reason ?? null } : {};
      if (action === "aprobar" && opts?.amountClp !== undefined) {
        body.amountClp = opts.amountClp;
      }
      const response = await fetch(`/api/te/${id}/${action}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Error actualizando turno extra");
      }
      setItems((prev) =>
        prev.map((row) =>
          row.id === id
            ? {
                ...row,
                status: payload.data.status,
                amountClp: payload.data.amountClp ?? row.amountClp,
                approvedAt: payload.data.approvedAt,
                rejectedAt: payload.data.rejectedAt,
                paidAt: payload.data.paidAt,
              }
            : row
        )
      );
      toast.success(action === "aprobar" ? "Turno aprobado" : "Turno rechazado");
      setAprobarModal(null);
    } catch (error) {
      console.error(error);
      toast.error("No se pudo actualizar el turno");
    } finally {
      setUpdatingId(null);
    }
  };

  const fetchInstallations = useCallback(async () => {
    const res = await fetch("/api/ops/instalaciones", { cache: "no-store" });
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      // Agrupar instalaciones por cliente (account)
      const map = new Map<string, { id: string; name: string; installations: Array<{ id: string; name: string; teMontoClp?: number | string | null }> }>();
      for (const i of data.data) {
        const acc = i.account ?? { id: "unknown", name: "Sin cliente" };
        if (!map.has(acc.id)) {
          map.set(acc.id, { id: acc.id, name: acc.name, installations: [] });
        }
        map.get(acc.id)!.installations.push({
          id: i.id,
          name: i.name,
          teMontoClp: i.teMontoClp,
        });
      }
      setClients(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)));
    }
  }, []);

  const fetchPuestos = useCallback(async (installationId: string) => {
    if (!installationId) {
      setPuestos([]);
      return;
    }
    const res = await fetch(`/api/ops/puestos?installationId=${installationId}`, { cache: "no-store" });
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      setPuestos(
        data.data
          .filter((p: { active?: boolean }) => p.active !== false)
          .map((p: { id: string; name: string; teMontoClp?: number | string | null }) => ({
            id: p.id,
            name: p.name,
            teMontoClp: p.teMontoClp,
          }))
      );
    } else {
      setPuestos([]);
    }
  }, []);

  const fetchGuardias = useCallback(async () => {
    // Traer guardias seleccionados y contratados activos, sin lista negra
    const res = await fetch("/api/personas/guardias?blacklisted=false", { cache: "no-store" });
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      setGuardias(
        data.data
          .filter((g: { lifecycleStatus?: string; status?: string; isBlacklisted?: boolean }) => {
            const ls = g.lifecycleStatus ?? "";
            // Solo seleccionados y contratados activos
            return (ls === "seleccionado" || ls === "contratado") && !g.isBlacklisted;
          })
          .map((g: { id: string; code?: string | null; lifecycleStatus?: string; persona: { firstName: string; lastName: string; rut?: string | null } }) => ({
            id: g.id,
            code: g.code,
            persona: g.persona,
            lifecycleStatus: g.lifecycleStatus,
          }))
          .sort((a: { persona: { firstName: string; lastName: string } }, b: { persona: { firstName: string; lastName: string } }) =>
            `${a.persona.firstName} ${a.persona.lastName}`.localeCompare(`${b.persona.firstName} ${b.persona.lastName}`)
          )
      );
    } else {
      setGuardias([]);
    }
  }, []);

  useEffect(() => {
    if (createModalOpen) {
      void fetchInstallations();
      void fetchGuardias();
    }
  }, [createModalOpen, fetchInstallations, fetchGuardias]);

  useEffect(() => {
    if (createForm.installationId) {
      void fetchPuestos(createForm.installationId);
    } else {
      setPuestos([]);
    }
  }, [createForm.installationId, fetchPuestos]);

  const handleCreateTe = async () => {
    if (!createForm.installationId || !createForm.guardiaId || !createForm.date) {
      toast.error("Instalación, guardia y fecha son requeridos");
      return;
    }
    const amount = createForm.amountClp ? Number(createForm.amountClp) : undefined;
    if (amount !== undefined && (Number.isNaN(amount) || amount < 0)) {
      toast.error("Monto inválido");
      return;
    }
    setCreateSubmitting(true);
    try {
      const res = await fetch("/api/te", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId: createForm.installationId,
          puestoId: createForm.puestoId || null,
          guardiaId: createForm.guardiaId,
          date: createForm.date,
          tipo: createForm.tipo,
          amountClp: amount,
          horasExtra: createForm.horasExtra ? Number(createForm.horasExtra) : null,
          notes: createForm.notes || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo crear el turno extra");
      }
      const newItem = payload.data;
      setItems((prev) => [
        {
          id: newItem.id,
          date: newItem.date,
          status: newItem.status,
          amountClp: newItem.amountClp,
          tipo: newItem.tipo,
          isManual: newItem.isManual,
          horasExtra: newItem.horasExtra,
          installation: newItem.installation,
          puesto: newItem.puesto,
          guardia: newItem.guardia,
        },
        ...prev,
      ]);
      toast.success("Turno extra creado");
      setCreateModalOpen(false);
      setCreateForm({
        clientId: "",
        installationId: "",
        puestoId: "",
        guardiaId: "",
        date: new Date().toISOString().slice(0, 10),
        tipo: "turno_extra",
        amountClp: "",
        horasExtra: "",
        notes: "",
      });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "No se pudo crear");
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Instalaciones del cliente seleccionado
  const clientInstallations = useMemo(() => {
    if (!createForm.clientId) return [];
    return clients.find((c) => c.id === createForm.clientId)?.installations ?? [];
  }, [clients, createForm.clientId]);

  useEffect(() => {
    if (!createModalOpen) return;
    const puesto = puestos.find((p) => p.id === createForm.puestoId);
    const inst = clientInstallations.find((i) => i.id === createForm.installationId);
    const amt =
      puesto?.teMontoClp != null && Number(puesto.teMontoClp) > 0
        ? Number(puesto.teMontoClp)
        : inst?.teMontoClp != null && Number(inst.teMontoClp) > 0
          ? Number(inst.teMontoClp)
          : 0;
    if (amt > 0 && !createForm.amountClp) {
      setCreateForm((f) => ({ ...f, amountClp: String(amt) }));
    }
  }, [createModalOpen, createForm.installationId, createForm.puestoId, createForm.amountClp, puestos, clientInstallations]);

  const handleGenerarPlantilla = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      toast.error("Selecciona al menos un turno aprobado");
      return;
    }
    setGeneratingPlantilla(true);
    try {
      const createRes = await fetch("/api/te/lotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnoExtraIds: ids }),
      });
      const createPayload = await createRes.json();
      if (!createRes.ok || !createPayload.success) {
        throw new Error(createPayload.error || "No se pudo crear el lote");
      }
      const loteId = createPayload.data?.id;
      if (!loteId) throw new Error("Lote creado sin ID");

      const exportUrl = `/api/te/lotes/${loteId}/export-santander`;
      const exportRes = await fetch(exportUrl);
      if (!exportRes.ok) throw new Error("No se pudo generar la plantilla");
      const blob = await exportRes.blob();
      const code = createPayload.data?.code ?? "lote";
      const filename = `${code}-santander.xlsx`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);

      setSelectedIds(new Set());
      setItems((prev) =>
        prev.map((row) =>
          ids.includes(row.id)
            ? {
                ...row,
                paymentItems: [
                  {
                    id: "",
                    loteId,
                    amountClp: row.amountClp,
                    status: "pending",
                  },
                ],
              }
            : row
        )
      );
      toast.success(`Lote creado. Plantilla ${filename} descargada.`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "No se pudo generar la plantilla");
    } finally {
      setGeneratingPlantilla(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <Button
              type="button"
              size="sm"
              onClick={() => setCreateModalOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Nuevo turno/hora extra
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por instalación, puesto, guardia o RUT..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="pending">Pendientes</option>
              <option value="approved">Aprobados</option>
              <option value="rejected">Rechazados</option>
              <option value="paid">Pagados</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {filtered.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={selectAllApproved}
              >
                Seleccionar todos los aprobados
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={clearSelection}
                disabled={selectedIds.size === 0}
              >
                Quitar selección
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={selectedIds.size === 0 || generatingPlantilla}
                onClick={() => void handleGenerarPlantilla()}
              >
                {generatingPlantilla ? "..." : (
                  <>
                    <FileDown className="h-4 w-4 mr-1" />
                    Generar plantilla de pago ({selectedIds.size})
                  </>
                )}
              </Button>
              {selectedIds.size > 0 && (
                <span className="text-xs text-muted-foreground">
                  {selectedIds.size} turno(s) seleccionado(s)
                </span>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Clock3 className="h-8 w-8" />}
              title="Sin turnos extra"
              description="No hay registros para los filtros seleccionados."
              compact
            />
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-border p-3 sm:p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {canAddToLote(item) ? (
                      <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="rounded border-border"
                        />
                        <span className="sr-only">Incluir en plantilla de pago</span>
                      </label>
                    ) : (
                      <span className="w-5 shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">
                          {item.guardia.persona.firstName} {item.guardia.persona.lastName}
                        </p>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            (item.tipo ?? "turno_extra") === "hora_extra"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                              : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                          }`}
                        >
                          {(item.tipo ?? "turno_extra") === "hora_extra" ? "HE" : "TE"}
                        </span>
                        {item.isManual && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 font-medium">
                            Manual
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.installation?.name ?? "Instalación"} · {item.puesto?.name ?? "Sin puesto"} ·{" "}
                        {toDateLabel(item.date)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Monto: ${toNumber(item.amountClp).toLocaleString("es-CL")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusBadge status={item.status} />
                    {item.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={updatingId === item.id}
                          onClick={() =>
                            setAprobarModal({
                              item,
                              amountClp: String(toNumber(item.amountClp)),
                            })
                          }
                        >
                          Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={updatingId === item.id}
                          onClick={() => {
                            const reason = window.prompt("Motivo de rechazo (opcional):") ?? "";
                            void patch(item.id, "rechazar", { reason: reason || undefined });
                          }}
                        >
                          Rechazar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo turno/hora extra</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cliente</Label>
              <select
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={createForm.clientId}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    clientId: e.target.value,
                    installationId: "",
                    puestoId: "",
                    amountClp: "",
                  }))
                }
              >
                <option value="">Seleccionar cliente...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Instalación</Label>
              <select
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={createForm.installationId}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    installationId: e.target.value,
                    puestoId: "",
                    amountClp: "",
                  }))
                }
                disabled={!createForm.clientId}
              >
                <option value="">Seleccionar instalación...</option>
                {clientInstallations.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Puesto (opcional)</Label>
              <select
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={createForm.puestoId}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    puestoId: e.target.value,
                    amountClp: "",
                  }))
                }
                disabled={!createForm.installationId}
              >
                <option value="">Sin puesto</option>
                {puestos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Guardia</Label>
              <select
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={createForm.guardiaId}
                onChange={(e) => setCreateForm((f) => ({ ...f, guardiaId: e.target.value }))}
              >
                <option value="">Seleccionar...</option>
                {guardias.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.persona.firstName} {g.persona.lastName}
                    {g.code ? ` (${g.code})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Fecha</Label>
              <Input
                type="date"
                value={createForm.date}
                onChange={(e) => setCreateForm((f) => ({ ...f, date: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <select
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={createForm.tipo}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    tipo: e.target.value as "turno_extra" | "hora_extra",
                  }))
                }
              >
                <option value="turno_extra">Turno Extra</option>
                <option value="hora_extra">Hora Extra</option>
              </select>
            </div>
            <div>
              <Label>Monto CLP (opcional, se prellena desde instalación/puesto)</Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="Ej: 25.000"
                value={createForm.amountClp ? Number(createForm.amountClp).toLocaleString("es-CL") : ""}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "");
                  setCreateForm((f) => ({ ...f, amountClp: raw }));
                }}
                className="mt-1"
              />
            </div>
            {createForm.tipo === "hora_extra" && (
              <div>
                <Label>Cantidad de horas (informativo)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder="Ej: 2"
                  value={createForm.horasExtra}
                  onChange={(e) => setCreateForm((f) => ({ ...f, horasExtra: e.target.value }))}
                  className="mt-1"
                />
              </div>
            )}
            <div>
              <Label>Notas (opcional)</Label>
              <Input
                placeholder="Notas"
                value={createForm.notes}
                onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={
                !createForm.installationId ||
                !createForm.guardiaId ||
                !createForm.date ||
                createSubmitting
              }
              onClick={() => void handleCreateTe()}
            >
              {createSubmitting ? "Guardando..." : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!aprobarModal}
        onOpenChange={(open) => !open && setAprobarModal(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Aprobar turno extra</DialogTitle>
          </DialogHeader>
          {aprobarModal && (
            <div className="space-y-4">
              <div>
                <Label>Monto CLP</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={aprobarModal.amountClp ? Number(aprobarModal.amountClp).toLocaleString("es-CL") : ""}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, "");
                    setAprobarModal((m) => (m ? { ...m, amountClp: raw } : null));
                  }}
                  className="mt-1"
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setAprobarModal(null)}
                >
                  Cancelar
                </Button>
                <Button
                  disabled={updatingId === aprobarModal.item.id}
                  onClick={() =>
                    void patch(aprobarModal.item.id, "aprobar", {
                      amountClp: Number(aprobarModal.amountClp) || 0,
                    })
                  }
                >
                  Aprobar con este monto
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
