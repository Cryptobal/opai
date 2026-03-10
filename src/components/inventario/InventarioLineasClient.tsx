"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  Plus,
  Phone,
  Pencil,
  Trash2,
  ArrowRightLeft,
  Unlink,
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────
type PhoneLineAssignment = {
  id: string;
  installationId: string;
  assignedAt: string;
  assignedBy: string | null;
  returnedAt: string | null;
  notes: string | null;
  installation: { id: string; name: string };
};

type PhoneLine = {
  id: string;
  phoneNumber: string;
  carrier: string;
  planType: string | null;
  status: string;
  label: string | null;
  assetId: string | null;
  notes: string | null;
  createdAt: string;
  asset: { id: string; serialNumber: string | null } | null;
  assignments: PhoneLineAssignment[];
};

type Installation = { id: string; name: string };

// ── Constants ──────────────────────────────────────────
const CARRIERS = ["movistar", "entel", "wom", "claro", "otro"];

const CARRIER_COLORS: Record<string, string> = {
  movistar: "bg-green-500/15 text-green-700 dark:text-green-400",
  entel: "bg-red-500/15 text-red-700 dark:text-red-400",
  wom: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  claro: "bg-red-600/15 text-red-800 dark:text-red-300",
  otro: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-400",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  suspended: "Suspendida",
  cancelled: "Cancelada",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  suspended: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  cancelled: "bg-red-500/15 text-red-700 dark:text-red-400",
};

const emptyForm = {
  phoneNumber: "",
  carrier: "movistar",
  planType: "",
  status: "active" as string,
  label: "",
  notes: "",
};

// ── Component ──────────────────────────────────────────
export function InventarioLineasClient() {
  const [lines, setLines] = useState<PhoneLine[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterCarrier, setFilterCarrier] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterInstallation, setFilterInstallation] = useState("");
  const [filterUnassigned, setFilterUnassigned] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Assign dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignLineId, setAssignLineId] = useState<string | null>(null);
  const [assignInstallationId, setAssignInstallationId] = useState("");
  const [assignNotes, setAssignNotes] = useState("");

  // Expanded row for history
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<PhoneLineAssignment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Fetch ──────────────────────────────────────────
  const fetchLines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterCarrier) params.set("carrier", filterCarrier);
      if (filterStatus) params.set("status", filterStatus);
      if (filterInstallation) params.set("installationId", filterInstallation);
      if (filterUnassigned) params.set("unassigned", "true");
      if (searchQuery) params.set("search", searchQuery);
      const qs = params.toString();

      const res = await fetch(`/api/ops/inventario/phone-lines${qs ? `?${qs}` : ""}`);
      const data = await res.json();
      if (Array.isArray(data)) setLines(data);
      else setError(data?.error || "Error al cargar líneas.");
    } catch {
      setError("No se pudo conectar al servidor.");
    } finally {
      setLoading(false);
    }
  }, [filterCarrier, filterStatus, filterInstallation, filterUnassigned, searchQuery]);

  const fetchInstallations = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/installations");
      const json = await res.json();
      const list = json?.data ?? json;
      if (Array.isArray(list)) setInstallations(list.map((i: { id: string; name: string }) => ({ id: i.id, name: i.name })));
    } catch {
      // silent - installations are for assignment only
    }
  }, []);

  useEffect(() => {
    fetchLines();
  }, [fetchLines]);

  useEffect(() => {
    fetchInstallations();
  }, [fetchInstallations]);

  // ── Create / Edit ──────────────────────────────────
  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (line: PhoneLine) => {
    setEditingId(line.id);
    setForm({
      phoneNumber: line.phoneNumber,
      carrier: line.carrier,
      planType: line.planType ?? "",
      status: line.status,
      label: line.label ?? "",
      notes: line.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingId
        ? `/api/ops/inventario/phone-lines/${editingId}`
        : "/api/ops/inventario/phone-lines";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: form.phoneNumber,
          carrier: form.carrier,
          planType: form.planType || null,
          status: form.status,
          label: form.label || null,
          notes: form.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Error al guardar");
        return;
      }
      toast.success(editingId ? "Línea actualizada" : "Línea creada");
      setDialogOpen(false);
      fetchLines();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────
  const handleDelete = async (line: PhoneLine) => {
    if (!confirm(`¿Eliminar la línea ${line.phoneNumber}?`)) return;
    try {
      const res = await fetch(`/api/ops/inventario/phone-lines/${line.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Error al eliminar");
        return;
      }
      toast.success("Línea eliminada");
      fetchLines();
    } catch {
      toast.error("Error de conexión");
    }
  };

  // ── Assign / Unassign ─────────────────────────────
  const openAssign = (lineId: string) => {
    setAssignLineId(lineId);
    setAssignInstallationId("");
    setAssignNotes("");
    setAssignDialogOpen(true);
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignLineId || !assignInstallationId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/ops/inventario/phone-lines/${assignLineId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId: assignInstallationId,
          notes: assignNotes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Error al asignar");
        return;
      }
      toast.success("Línea asignada");
      setAssignDialogOpen(false);
      fetchLines();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const handleUnassign = async (lineId: string) => {
    if (!confirm("¿Desvincular esta línea de la instalación?")) return;
    try {
      const res = await fetch(`/api/ops/inventario/phone-lines/${lineId}/assign`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Error al desvincular");
        return;
      }
      toast.success("Línea desvinculada");
      fetchLines();
    } catch {
      toast.error("Error de conexión");
    }
  };

  // ── History expand ─────────────────────────────────
  const toggleHistory = async (lineId: string) => {
    if (expandedId === lineId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(lineId);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/ops/inventario/phone-lines/${lineId}`);
      const data = await res.json();
      setHistoryData(data.assignments ?? []);
    } catch {
      setHistoryData([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // ── Helpers ────────────────────────────────────────
  const formatPhone = (n: string) => {
    // Format +56912345678 → +56 9 1234 5678
    const m = n.match(/^\+56(\d)(\d{4})(\d{4})$/);
    if (m) return `+56 ${m[1]} ${m[2]} ${m[3]}`;
    return n;
  };

  const hasActiveFilters = filterCarrier || filterStatus || filterInstallation || filterUnassigned || searchQuery;

  // ── Render ─────────────────────────────────────────
  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Líneas Telefónicas</CardTitle>
            <CardDescription>
              Líneas SIM y números asignados a instalaciones. Gestiona compañía, plan y estado.
            </CardDescription>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva línea
          </Button>
        </CardHeader>
        <CardContent>
          {/* ── Filters ── */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar número o etiqueta..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <select
              value={filterCarrier}
              onChange={(e) => setFilterCarrier(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Compañía</option>
              {CARRIERS.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Estado</option>
              <option value="active">Activa</option>
              <option value="suspended">Suspendida</option>
              <option value="cancelled">Cancelada</option>
            </select>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={filterUnassigned}
                onChange={(e) => setFilterUnassigned(e.target.checked)}
                className="rounded"
              />
              Sin asignar
            </label>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterCarrier("");
                  setFilterStatus("");
                  setFilterInstallation("");
                  setFilterUnassigned(false);
                  setSearchQuery("");
                }}
              >
                Limpiar filtros
              </Button>
            )}
          </div>

          {/* ── Table ── */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
              {error}
            </div>
          ) : lines.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {hasActiveFilters
                ? "No se encontraron líneas con los filtros aplicados."
                : "No hay líneas telefónicas. Crea una para comenzar."}
            </p>
          ) : (
            <div className="space-y-2">
              {lines.map((line) => {
                const activeAssignment = line.assignments[0] ?? null;
                const isExpanded = expandedId === line.id;

                return (
                  <div key={line.id} className="rounded-lg border">
                    <div className="flex items-center justify-between p-3 gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <a
                              href={`tel:${line.phoneNumber}`}
                              className="font-medium hover:underline"
                            >
                              {formatPhone(line.phoneNumber)}
                            </a>
                            <Badge className={CARRIER_COLORS[line.carrier] ?? CARRIER_COLORS.otro}>
                              {line.carrier.charAt(0).toUpperCase() + line.carrier.slice(1)}
                            </Badge>
                            <Badge className={STATUS_COLORS[line.status] ?? ""}>
                              {STATUS_LABELS[line.status] ?? line.status}
                            </Badge>
                            {line.planType && (
                              <span className="text-xs text-muted-foreground">
                                {line.planType === "prepago" ? "Prepago" : "Contrato"}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground">
                            {line.label && <span>{line.label}</span>}
                            {activeAssignment && (
                              <span>
                                {line.label ? "·" : ""} {activeAssignment.installation.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {activeAssignment ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Desvincular"
                            onClick={() => handleUnassign(line.id)}
                          >
                            <Unlink className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Asignar a instalación"
                          onClick={() => openAssign(line.id)}
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Editar"
                          onClick={() => openEdit(line)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Eliminar"
                          onClick={() => handleDelete(line)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Historial"
                          onClick={() => toggleHistory(line.id)}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Expanded history */}
                    {isExpanded && (
                      <div className="border-t px-3 py-3 bg-muted/30">
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                          Historial de asignaciones
                        </p>
                        {historyLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : historyData.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Sin asignaciones previas.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {historyData.map((a) => (
                              <div key={a.id} className="flex items-center gap-2 text-sm">
                                <span className="font-medium">{a.installation.name}</span>
                                <span className="text-muted-foreground">
                                  {new Date(a.assignedAt).toLocaleDateString("es-CL")}
                                  {a.returnedAt
                                    ? ` → ${new Date(a.returnedAt).toLocaleDateString("es-CL")}`
                                    : " → actual"}
                                </span>
                                {a.notes && (
                                  <span className="text-xs text-muted-foreground italic">
                                    ({a.notes})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create/Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar línea" : "Nueva línea telefónica"}</DialogTitle>
              <DialogDescription>
                {editingId
                  ? "Modifica los datos de la línea."
                  : "Registra un número de teléfono / SIM."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div>
                <Label>Número de teléfono *</Label>
                <Input
                  value={form.phoneNumber}
                  onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                  placeholder="+56 9 1234 5678"
                  required
                />
              </div>
              <div>
                <Label>Compañía *</Label>
                <select
                  value={form.carrier}
                  onChange={(e) => setForm((f) => ({ ...f, carrier: e.target.value }))}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  required
                >
                  {CARRIERS.map((c) => (
                    <option key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Plan</Label>
                  <select
                    value={form.planType}
                    onChange={(e) => setForm((f) => ({ ...f, planType: e.target.value }))}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Sin especificar</option>
                    <option value="prepago">Prepago</option>
                    <option value="contrato">Contrato</option>
                  </select>
                </div>
                <div>
                  <Label>Estado</Label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="active">Activa</option>
                    <option value="suspended">Suspendida</option>
                    <option value="cancelled">Cancelada</option>
                  </select>
                </div>
              </div>
              <div>
                <Label>Etiqueta</Label>
                <Input
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="Ej: Garita, Supervisor, Rondín..."
                />
              </div>
              <div>
                <Label>Notas</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Opcional"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Assign Dialog ── */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <form onSubmit={handleAssign}>
            <DialogHeader>
              <DialogTitle>Asignar línea a instalación</DialogTitle>
              <DialogDescription>
                Si la línea ya está asignada a otra instalación, se moverá automáticamente.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div>
                <Label>Instalación *</Label>
                <div className="mt-1">
                  <SearchableSelect
                    value={assignInstallationId}
                    options={installations.map((i) => ({
                      id: i.id,
                      label: i.name,
                    }))}
                    placeholder="Buscar instalación..."
                    emptyText="Sin instalaciones"
                    onChange={(id) => setAssignInstallationId(id)}
                  />
                </div>
              </div>
              <div>
                <Label>Notas</Label>
                <Input
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  placeholder="Motivo del cambio (opcional)"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAssignDialogOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !assignInstallationId}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Asignar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
