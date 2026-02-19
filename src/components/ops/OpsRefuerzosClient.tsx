"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, StatusBadge } from "@/components/opai";
import { Clock3, FileDown, Plus, Search } from "lucide-react";

type RefuerzoItem = {
  id: string;
  installationId: string;
  accountId?: string | null;
  guardiaId: string;
  puestoId?: string | null;
  requestedByName?: string | null;
  requestChannel?: string | null;
  startAt: string;
  endAt: string;
  guardsCount: number;
  shiftType?: string | null;
  paymentCondition?: string | null;
  guardPaymentClp: number;
  estimatedTotalClp: number;
  status: "solicitado" | "en_curso" | "realizado" | "facturado";
  invoiceNumber?: string | null;
  installation: { id: string; name: string };
  account?: { id: string; name: string } | null;
  puesto?: { id: string; name: string } | null;
  guardia: {
    id: string;
    code?: string | null;
    persona: { firstName: string; lastName: string; rut?: string | null };
  };
  turnoExtra?: { id: string; status: string; amountClp: number; paidAt?: string | null } | null;
};

type InstallationOption = {
  id: string;
  name: string;
  account?: { id: string; name: string } | null;
};

type GuardiaOption = {
  id: string;
  code?: string | null;
  persona: { firstName: string; lastName: string; rut?: string | null };
};

interface OpsRefuerzosClientProps {
  initialItems: RefuerzoItem[];
  defaultInstallationId?: string;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateTimeInputValue(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString("es-CL")}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function OpsRefuerzosClient({ initialItems, defaultInstallationId }: OpsRefuerzosClientProps) {
  const [items, setItems] = useState<RefuerzoItem[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pendingBillingOnly, setPendingBillingOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [installations, setInstallations] = useState<InstallationOption[]>([]);
  const [puestos, setPuestos] = useState<Array<{ id: string; name: string }>>([]);
  const [guardias, setGuardias] = useState<GuardiaOption[]>([]);

  const [createForm, setCreateForm] = useState({
    installationId: defaultInstallationId ?? "",
    puestoId: "",
    guardiaId: "",
    requestedByName: "",
    requestChannel: "whatsapp",
    startAt: toDateTimeInputValue(),
    endAt: toDateTimeInputValue(new Date(Date.now() + 8 * 3_600_000)),
    guardsCount: "1",
    shiftType: "diurno",
    paymentCondition: "incluido_factura_mensual",
    guardPaymentClp: "",
    rateMode: "turno" as "turno" | "hora",
    rateClp: "",
    notes: "",
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (pendingBillingOnly && row.status === "facturado") return false;
      if (q) {
        const haystack =
          `${row.installation.name} ${row.account?.name ?? ""} ${row.guardia.persona.firstName} ${row.guardia.persona.lastName} ${row.guardia.persona.rut ?? ""} ${row.requestedByName ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [items, pendingBillingOnly, search, statusFilter]);

  const totals = useMemo(() => {
    const pending = filtered.filter((x) => x.status !== "facturado");
    return {
      count: filtered.length,
      amount: filtered.reduce((acc, row) => acc + toNumber(row.estimatedTotalClp), 0),
      pendingAmount: pending.reduce((acc, row) => acc + toNumber(row.estimatedTotalClp), 0),
    };
  }, [filtered]);

  async function loadAuxData() {
    try {
      const [instRes, guardsRes] = await Promise.all([
        fetch("/api/ops/instalaciones", { cache: "no-store" }),
        fetch("/api/personas/guardias?blacklisted=false", { cache: "no-store" }),
      ]);
      const instPayload = await instRes.json();
      const guardsPayload = await guardsRes.json();
      if (instPayload.success) setInstallations(instPayload.data);
      if (guardsPayload.success) {
        setGuardias(
          guardsPayload.data
            .filter((g: { lifecycleStatus?: string; isBlacklisted?: boolean }) => !g.isBlacklisted)
            .map((g: GuardiaOption) => g)
        );
      }
    } catch {
      toast.error("No se pudieron cargar instalaciones/guardias");
    }
  }

  useEffect(() => {
    if (!createOpen) return;
    void loadAuxData();
  }, [createOpen]);

  useEffect(() => {
    if (!createForm.installationId) {
      setPuestos([]);
      return;
    }
    const run = async () => {
      const res = await fetch(`/api/ops/puestos?installationId=${createForm.installationId}`, { cache: "no-store" });
      const payload = await res.json();
      if (payload.success) {
        setPuestos(payload.data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
      } else {
        setPuestos([]);
      }
    };
    void run();
  }, [createForm.installationId]);

  async function createRefuerzo() {
    if (!createForm.installationId || !createForm.guardiaId || !createForm.guardPaymentClp) {
      toast.error("Instalación, guardia y pago guardia son obligatorios");
      return;
    }
    setLoading(true);
    try {
      const body = {
        installationId: createForm.installationId,
        puestoId: createForm.puestoId || null,
        guardiaId: createForm.guardiaId,
        requestedByName: createForm.requestedByName || null,
        requestChannel: createForm.requestChannel,
        startAt: new Date(createForm.startAt).toISOString(),
        endAt: new Date(createForm.endAt).toISOString(),
        guardsCount: Number(createForm.guardsCount || 1),
        shiftType: createForm.shiftType || null,
        paymentCondition: createForm.paymentCondition || null,
        guardPaymentClp: Number(createForm.guardPaymentClp),
        rateMode: createForm.rateMode,
        rateClp: createForm.rateClp ? Number(createForm.rateClp) : null,
        notes: createForm.notes || null,
      };
      const res = await fetch("/api/ops/refuerzos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "No se pudo crear");
      setItems((prev) => [payload.data, ...prev]);
      setCreateOpen(false);
      toast.success("Solicitud creada y enviada a Turnos Extra");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear");
    } finally {
      setLoading(false);
    }
  }

  async function patchStatus(item: RefuerzoItem, status: "en_curso" | "facturado") {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { status };
      if (status === "facturado") {
        const invoiceNumber = window.prompt("Número de factura", item.invoiceNumber ?? "");
        if (!invoiceNumber) {
          setLoading(false);
          return;
        }
        body.invoiceNumber = invoiceNumber;
      }
      const res = await fetch(`/api/ops/refuerzos/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "No se pudo actualizar estado");
      setItems((prev) => prev.map((x) => (x.id === item.id ? payload.data : x)));
      toast.success("Estado actualizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar");
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (pendingBillingOnly) params.set("pendingBilling", "true");
    if (search.trim()) params.set("q", search.trim());
    window.location.href = `/api/ops/refuerzos/export?${params.toString()}`;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Nuevo turno de refuerzo
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <FileDown className="h-4 w-4 mr-1" />
              Exportar CSV
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por instalación, cliente, guardia o solicitado por..."
              />
            </div>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              <option value="solicitado">Solicitado</option>
              <option value="en_curso">En curso</option>
              <option value="realizado">Realizado</option>
              <option value="facturado">Facturado</option>
            </select>
            <label className="h-9 rounded-md border border-input px-3 text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={pendingBillingOnly}
                onChange={(e) => setPendingBillingOnly(e.target.checked)}
              />
              Pendientes de facturar
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded border p-2">Turnos: <strong>{totals.count}</strong></div>
            <div className="rounded border p-2">Monto total: <strong>{formatMoney(totals.amount)}</strong></div>
            <div className="rounded border p-2">Pendiente facturar: <strong>{formatMoney(totals.pendingAmount)}</strong></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Clock3 className="h-8 w-8" />}
              title="Sin turnos de refuerzo"
              description="No hay resultados para los filtros seleccionados."
              compact
            />
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => (
                <div key={item.id} className="rounded-lg border p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {item.installation.name} · {item.guardia.persona.firstName} {item.guardia.persona.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.account?.name ?? "Sin cliente"} · {formatDateTime(item.startAt)} - {formatDateTime(item.endAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Pago guardia: {formatMoney(toNumber(item.guardPaymentClp))} · Estimado facturable: {formatMoney(toNumber(item.estimatedTotalClp))}
                    </p>
                    {item.invoiceNumber && (
                      <p className="text-xs text-muted-foreground">Factura: {item.invoiceNumber}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={item.status} />
                    {item.status === "solicitado" && (
                      <Button size="sm" variant="outline" disabled={loading} onClick={() => void patchStatus(item, "en_curso")}>
                        Marcar en curso
                      </Button>
                    )}
                    {item.status !== "facturado" && (
                      <Button size="sm" disabled={loading} onClick={() => void patchStatus(item, "facturado")}>
                        Marcar facturado
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva solicitud de turno de refuerzo</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Instalación</Label>
              <select
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={createForm.installationId}
                onChange={(e) => setCreateForm((f) => ({ ...f, installationId: e.target.value, puestoId: "" }))}
                disabled={Boolean(defaultInstallationId)}
              >
                <option value="">Seleccionar instalación...</option>
                {installations.map((inst) => (
                  <option key={inst.id} value={inst.id}>{inst.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Puesto (opcional)</Label>
              <select
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={createForm.puestoId}
                onChange={(e) => setCreateForm((f) => ({ ...f, puestoId: e.target.value }))}
              >
                <option value="">Sin puesto</option>
                {puestos.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Guardia asignado</Label>
              <select
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={createForm.guardiaId}
                onChange={(e) => setCreateForm((f) => ({ ...f, guardiaId: e.target.value }))}
              >
                <option value="">Seleccionar guardia...</option>
                {guardias.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.persona.firstName} {g.persona.lastName}{g.code ? ` (${g.code})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Inicio</Label>
                <Input type="datetime-local" value={createForm.startAt} onChange={(e) => setCreateForm((f) => ({ ...f, startAt: e.target.value }))} />
              </div>
              <div>
                <Label>Fin</Label>
                <Input type="datetime-local" value={createForm.endAt} onChange={(e) => setCreateForm((f) => ({ ...f, endAt: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Solicitado por</Label>
                <Input value={createForm.requestedByName} onChange={(e) => setCreateForm((f) => ({ ...f, requestedByName: e.target.value }))} />
              </div>
              <div>
                <Label>Canal</Label>
                <select className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={createForm.requestChannel} onChange={(e) => setCreateForm((f) => ({ ...f, requestChannel: e.target.value }))}>
                  <option value="telefono">Teléfono</option>
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="presencial">Presencial</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Pago guardia (CLP)</Label>
                <Input
                  inputMode="numeric"
                  value={createForm.guardPaymentClp}
                  onChange={(e) => setCreateForm((f) => ({ ...f, guardPaymentClp: e.target.value.replace(/\D/g, "") }))}
                />
              </div>
              <div>
                <Label>Valor ofertado (CLP)</Label>
                <Input
                  inputMode="numeric"
                  value={createForm.rateClp}
                  onChange={(e) => setCreateForm((f) => ({ ...f, rateClp: e.target.value.replace(/\D/g, "") }))}
                />
              </div>
            </div>
            <div>
              <Label>Observaciones</Label>
              <Input value={createForm.notes} onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button disabled={loading} onClick={() => void createRefuerzo()}>
              {loading ? "Guardando..." : "Crear solicitud"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
