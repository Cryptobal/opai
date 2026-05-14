"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Surface, Tag, IconBubble, EmptyState, Spinner } from "@/components/opai-ds";
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
  Search,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { CARRIERS, CARRIER_COLORS } from "@/lib/inventory/carrier-colors";

// ── Types ──────────────────────────────────────────────
type PhoneLineAssignment = {
  id: string;
  installationId: string | null;
  assignedToUserId: string | null;
  assignedAt: string;
  assignedBy: string | null;
  returnedAt: string | null;
  notes: string | null;
  installation: { id: string; name: string } | null;
  assignedToUser: { id: string; name: string; email: string } | null;
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
type SystemUser = { id: string; name: string; email: string };

// ── Constants ──────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  suspended: "Suspendida",
  cancelled: "Cancelada",
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
  const [users, setUsers] = useState<SystemUser[]>([]);
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

  // Assign dialog: "installation" | "user"
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignLineId, setAssignLineId] = useState<string | null>(null);
  const [assignTargetType, setAssignTargetType] = useState<"installation" | "user">("installation");
  const [assignInstallationId, setAssignInstallationId] = useState("");
  const [assignUserId, setAssignUserId] = useState("");
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
      if (Array.isArray(list)) {
        // API devuelve `status` (p. ej. "active"); `isActive` del modelo no siempre viene en el payload.
        const assignable = list.filter(
          (i: { status?: string; isActive?: boolean }) =>
            i.status === "active" || i.isActive === true
        );
        setInstallations(assignable.map((i: { id: string; name: string }) => ({ id: i.id, name: i.name })));
      }
    } catch {
      // silent
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/users");
      const json = await res.json();
      const list = json?.data?.users ?? [];
      if (Array.isArray(list)) {
        setUsers(list.map((u: { id: string; name: string; email: string }) => ({ id: u.id, name: u.name, email: u.email })));
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchLines();
  }, [fetchLines]);

  useEffect(() => {
    fetchInstallations();
  }, [fetchInstallations]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Deep link desde el command palette / búsqueda global: si llega
  // `?openId=<lineId>` y la línea está cargada, abrimos el diálogo de
  // edición. Disparamos una sola vez por valor de openId.
  const searchParams = useSearchParams();
  const openLineId = searchParams.get("openId");
  const [openedDeepLink, setOpenedDeepLink] = useState<string | null>(null);
  useEffect(() => {
    if (!openLineId || openedDeepLink === openLineId || lines.length === 0) return;
    const match = lines.find((l) => l.id === openLineId);
    if (match) {
      openEdit(match);
      setOpenedDeepLink(openLineId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openLineId, lines, openedDeepLink]);

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
    setAssignTargetType("installation");
    setAssignInstallationId("");
    setAssignUserId("");
    setAssignNotes("");
    setAssignDialogOpen(true);
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    const toInstallation = assignTargetType === "installation" && assignInstallationId;
    const toUser = assignTargetType === "user" && assignUserId;
    if (!assignLineId || (!toInstallation && !toUser)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/ops/inventario/phone-lines/${assignLineId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(toInstallation ? { installationId: assignInstallationId } : {}),
          ...(toUser ? { userId: assignUserId } : {}),
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
    if (!confirm("¿Desvincular esta línea?")) return;
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

  const handleExportExcel = async () => {
    try {
      const assignmentLabel = (a: PhoneLineAssignment) =>
        a.installation ? a.installation.name : a.assignedToUser ? a.assignedToUser.name : "—";

      const dataToExport = lines.map((line) => {
        const activeAssignment = line.assignments?.[0] ?? null;
        return {
          "Número": line.phoneNumber,
          "Número (Formato)": formatPhone(line.phoneNumber),
          "Compañía": line.carrier.charAt(0).toUpperCase() + line.carrier.slice(1),
          "Plan":
            line.planType === "prepago"
              ? "Prepago"
              : line.planType === "contrato"
              ? "Contrato"
              : "Sin especificar",
          "Estado": STATUS_LABELS[line.status] ?? line.status,
          "Etiqueta": line.label || "",
          "Asignado a": activeAssignment ? assignmentLabel(activeAssignment) : "Sin asignar",
          "Asignada desde": activeAssignment
            ? new Date(activeAssignment.assignedAt).toLocaleDateString("es-CL")
            : "",
          "Notas": line.notes || "",
        };
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Líneas Telefónicas");
      if (dataToExport.length > 0) {
        worksheet.columns = Object.keys(dataToExport[0]).map((k) => ({
          header: k,
          key: k,
        }));
        worksheet.addRows(dataToExport);
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Lineas_Telefonicas_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Excel descargado correctamente");
    } catch (error) {
      console.error("Error exporting to excel:", error);
      toast.error("No se pudo exportar el archivo Excel");
    }
  };

  // ── Render ─────────────────────────────────────────
  const statusToTagVariant = (s: string): "ok" | "warn" | "danger" | "neutral" =>
    s === "active" ? "ok" : s === "suspended" ? "warn" : s === "cancelled" ? "danger" : "neutral";

  return (
    <>
      <div className="space-y-5 ds-page-enter">
        <div className="flex justify-end">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="h-10 sm:h-9"
              onClick={handleExportExcel}
              disabled={loading || lines.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
            <Button variant="outline" className="h-10 sm:h-9" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva línea
            </Button>
          </div>
        </div>
        <div>
          {/* ── Filters ── */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-ds-text-4" />
              <Input
                placeholder="Buscar número o etiqueta..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10 sm:h-9"
              />
            </div>
            <select
              value={filterCarrier}
              onChange={(e) => setFilterCarrier(e.target.value)}
              className="h-10 sm:h-9 rounded-ds-md border border-ds-border-default bg-ds-surface-2 px-3 text-sm text-ds-text-1"
            >
              <option value="">Compañía</option>
              {CARRIERS.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-10 sm:h-9 rounded-ds-md border border-ds-border-default bg-ds-surface-2 px-3 text-sm text-ds-text-1"
            >
              <option value="">Estado</option>
              <option value="active">Activa</option>
              <option value="suspended">Suspendida</option>
              <option value="cancelled">Cancelada</option>
            </select>
            <label className="flex items-center gap-1.5 text-sm text-ds-text-3 cursor-pointer">
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
                className="h-9"
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
            <Spinner block label="Cargando…" />
          ) : error ? (
            <Surface elevation={1} padding="md" className="border-status-warn-border bg-status-warn-soft">
              <p className="text-sm text-status-warn-fg">{error}</p>
            </Surface>
          ) : lines.length === 0 ? (
            <Surface elevation={1} padding="none">
              <EmptyState
                icon={Phone}
                title={hasActiveFilters ? "Sin coincidencias" : "Sin líneas telefónicas"}
                description={
                  hasActiveFilters
                    ? "No se encontraron líneas con los filtros aplicados."
                    : "Crea una para comenzar."
                }
              />
            </Surface>
          ) : (
            <ul className="space-y-2 ds-list-cascade">
              {lines.map((line) => {
                const activeAssignment = line.assignments[0] ?? null;
                const isExpanded = expandedId === line.id;

                return (
                  <li key={line.id}>
                  <Surface elevation={1} padding="none" className="overflow-hidden">
                    <div className="flex items-center justify-between p-3 gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <IconBubble icon={Phone} variant="info" size="md" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <a
                              href={`tel:${line.phoneNumber}`}
                              className="text-sm font-mono font-medium tabular-nums text-ds-text-1 hover:underline whitespace-nowrap"
                            >
                              {formatPhone(line.phoneNumber)}
                            </a>
                            <span className={`inline-flex items-center h-5 px-2 text-xs font-medium leading-none rounded-full ${CARRIER_COLORS[line.carrier] ?? CARRIER_COLORS.otro}`}>
                              {line.carrier.charAt(0).toUpperCase() + line.carrier.slice(1)}
                            </span>
                            <Tag variant={statusToTagVariant(line.status)} size="sm">
                              {STATUS_LABELS[line.status] ?? line.status}
                            </Tag>
                            {line.planType && (
                              <span className="text-xs text-ds-text-3">
                                {line.planType === "prepago" ? "Prepago" : "Contrato"}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-sm text-ds-text-3">
                            {line.label && <span>{line.label}</span>}
                            {activeAssignment && (
                              <span>
                                {line.label ? "·" : ""}{" "}
                                {activeAssignment.installation
                                  ? activeAssignment.installation.name
                                  : activeAssignment.assignedToUser
                                    ? activeAssignment.assignedToUser.name
                                    : "—"}
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
                            className="h-9 w-9"
                            title="Desvincular"
                            onClick={() => handleUnassign(line.id)}
                          >
                            <Unlink className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          title="Asignar a instalación o usuario"
                          onClick={() => openAssign(line.id)}
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          title="Editar"
                          onClick={() => openEdit(line)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-status-danger-fg"
                          title="Eliminar"
                          onClick={() => handleDelete(line)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
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
                      <div className="border-t border-ds-border-subtle px-3 py-3 bg-ds-surface-2">
                        <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4 mb-2">
                          Historial de asignaciones
                        </p>
                        {historyLoading ? (
                          <Spinner size="sm" />
                        ) : historyData.length === 0 ? (
                          <p className="text-sm text-ds-text-3">Sin asignaciones previas.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {historyData.map((a) => (
                              <div key={a.id} className="flex items-center gap-2 text-sm">
                                <span className="font-medium text-ds-text-1">
                                  {a.installation
                                    ? a.installation.name
                                    : a.assignedToUser
                                      ? a.assignedToUser.name
                                      : "—"}
                                </span>
                                <span className="text-ds-text-3 font-mono text-xs">
                                  {new Date(a.assignedAt).toLocaleDateString("es-CL")}
                                  {a.returnedAt
                                    ? ` → ${new Date(a.returnedAt).toLocaleDateString("es-CL")}`
                                    : " → actual"}
                                </span>
                                {a.notes && (
                                  <span className="text-xs text-ds-text-4 italic">
                                    ({a.notes})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </Surface>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

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
                  className="h-10 sm:h-9"
                />
              </div>
              <div>
                <Label>Compañía *</Label>
                <select
                  value={form.carrier}
                  onChange={(e) => setForm((f) => ({ ...f, carrier: e.target.value }))}
                  className="w-full h-10 sm:h-9 rounded-ds-md border border-ds-border-default bg-ds-surface-2 px-3 text-sm text-ds-text-1"
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
                    className="w-full h-10 sm:h-9 rounded-ds-md border border-ds-border-default bg-ds-surface-2 px-3 text-sm text-ds-text-1"
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
                    className="w-full h-10 sm:h-9 rounded-ds-md border border-ds-border-default bg-ds-surface-2 px-3 text-sm text-ds-text-1"
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
                  className="h-10 sm:h-9"
                />
              </div>
              <div>
                <Label>Notas</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Opcional"
                  className="h-10 sm:h-9"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving} className="h-10 sm:h-9">
                Cancelar
              </Button>
              <Button type="submit" disabled={saving} className="h-10 sm:h-9">
                {saving && <Spinner size="sm" className="mr-2" />}
                {editingId ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Assign Dialog ── */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="overflow-visible sm:max-w-md">
          <form onSubmit={handleAssign}>
            <DialogHeader>
              <DialogTitle>Asignar línea</DialogTitle>
              <DialogDescription>
                Elige si asignas a una instalación o a un usuario del sistema. Si ya está asignada, se reasignará.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div>
                <Label>Asignar a *</Label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="assignTarget"
                      checked={assignTargetType === "installation"}
                      onChange={() => {
                        setAssignTargetType("installation");
                        setAssignUserId("");
                      }}
                      className="rounded"
                    />
                    Instalación
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="assignTarget"
                      checked={assignTargetType === "user"}
                      onChange={() => {
                        setAssignTargetType("user");
                        setAssignInstallationId("");
                      }}
                      className="rounded"
                    />
                    Usuario del sistema
                  </label>
                </div>
              </div>
              {assignTargetType === "installation" && (
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
              )}
              {assignTargetType === "user" && (
                <div>
                  <Label>Usuario del sistema *</Label>
                  <div className="mt-1">
                    <SearchableSelect
                      value={assignUserId}
                      options={users.map((u) => ({
                        id: u.id,
                        label: u.name,
                        description: u.email,
                      }))}
                      placeholder="Buscar usuario..."
                      emptyText="Sin usuarios"
                      onChange={(id) => setAssignUserId(id)}
                    />
                  </div>
                </div>
              )}
              <div>
                <Label>Notas</Label>
                <Input
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  placeholder="Motivo del cambio (opcional)"
                  className="h-10 sm:h-9"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAssignDialogOpen(false)} disabled={saving} className="h-10 sm:h-9">
                Cancelar
              </Button>
              <Button
                type="submit"
                className="h-10 sm:h-9"
                disabled={
                  saving ||
                  (assignTargetType === "installation" ? !assignInstallationId : !assignUserId)
                }
              >
                {saving && <Spinner size="sm" className="mr-2" />}
                Asignar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
