"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/opai";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Building2,
  ExternalLink,
  UserPlus,
  UserMinus,
  Search,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/* ── constants ─────────────────────────────────── */

const LIFECYCLE_COLORS: Record<string, string> = {
  postulante: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  seleccionado: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  contratado: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  te: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  inactivo: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

const LIFECYCLE_LABELS: Record<string, string> = {
  postulante: "Postulante",
  seleccionado: "Seleccionado",
  contratado: "Contratado",
  te: "Turno Extra",
  inactivo: "Inactivo",
};

const MESES_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

type FilterTab = "all" | "con_puestos" | "sin_pauta";

/* ── types ─────────────────────────────────────── */

type InstallationOption = { id: string; name: string; teMontoClp?: number | string | null };
type ClientOption = { id: string; name: string; rut?: string | null; installations: InstallationOption[] };

type PuestoItem = {
  id: string;
  installationId: string;
  name: string;
  shiftStart: string;
  shiftEnd: string;
  weekdays: string[];
  requiredGuards: number;
  active: boolean;
  cargo?: { id: string; name: string } | null;
  rol?: { id: string; name: string } | null;
};

type AsignacionItem = {
  id: string;
  guardiaId: string;
  puestoId: string;
  slotNumber: number;
  installationId: string;
  isActive: boolean;
  startDate: string;
  guardia: {
    id: string;
    code?: string | null;
    lifecycleStatus: string;
    persona: { firstName: string; lastName: string; rut?: string | null };
  };
};

type GuardiaOption = {
  id: string;
  code?: string | null;
  lifecycleStatus: string;
  persona: { firstName: string; lastName: string; rut?: string | null };
};

interface OpsPuestosClientProps {
  initialClients: ClientOption[];
  initialPuestos: PuestoItem[];
  initialAsignaciones: AsignacionItem[];
  guardias: GuardiaOption[];
  pautaCoverage?: Record<string, boolean>;
}

type InstallationRow = {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  puestosCount: number;
  totalSlots: number;
  vacantSlots: number;
  hasPauta: boolean;
};

/* ── component ─────────────────────────────────── */

export function OpsPuestosClient({
  initialClients,
  initialPuestos,
  initialAsignaciones,
  guardias,
  pautaCoverage = {},
}: OpsPuestosClientProps) {
  const [clients] = useState<ClientOption[]>(initialClients);
  const [puestos, setPuestos] = useState<PuestoItem[]>(initialPuestos);
  const [asignaciones, setAsignaciones] = useState<AsignacionItem[]>(initialAsignaciones);

  /* ── Navigation state ── */
  const [selectedClientId, setSelectedClientId] = useState<string>("__all__");
  const [selectedInstallation, setSelectedInstallation] = useState<InstallationRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");

  /* ── Modal state ── */
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ puestoId: string; slotNumber: number; puestoName: string } | null>(null);
  const [assignGuardiaId, setAssignGuardiaId] = useState("");
  const [assignSearch, setAssignSearch] = useState("");
  const [assignDate, setAssignDate] = useState(toDateInput(new Date()));
  const [assignWarning, setAssignWarning] = useState<{
    puestoName: string;
    installationName: string;
    accountName?: string | null;
  } | null>(null);
  const [assignSaving, setAssignSaving] = useState(false);

  const [unassignConfirm, setUnassignConfirm] = useState<{ open: boolean; asignacionId: string; guardiaName: string }>({
    open: false, asignacionId: "", guardiaName: "",
  });
  const [unassignDate, setUnassignDate] = useState(toDateInput(new Date()));
  const [unassignSaving, setUnassignSaving] = useState(false);

  const now = new Date();
  const currentMonthLabel = MESES_SHORT[now.getUTCMonth()];

  /* ════════════════════════════════════════════
     COMPUTED DATA
  ════════════════════════════════════════════ */

  /** All installations enriched with stats */
  const allInstallations = useMemo(() => {
    const rows: InstallationRow[] = [];
    for (const client of clients) {
      for (const inst of client.installations) {
        const instPuestos = puestos.filter((p) => p.installationId === inst.id && p.active);
        const totalSlots = instPuestos.reduce((sum, p) => sum + p.requiredGuards, 0);
        const assignedSlots = asignaciones.filter((a) => a.installationId === inst.id && a.isActive).length;
        rows.push({
          id: inst.id,
          name: inst.name,
          clientId: client.id,
          clientName: client.name,
          puestosCount: instPuestos.length,
          totalSlots,
          vacantSlots: Math.max(0, totalSlots - assignedSlots),
          hasPauta: !!pautaCoverage[inst.id],
        });
      }
    }
    return rows;
  }, [clients, puestos, asignaciones, pautaCoverage]);

  /** Client options for the dropdown (with installation counts) */
  const clientOptions = useMemo(() => {
    return clients.map((c) => {
      const instCount = c.installations.length;
      const withPuestos = allInstallations.filter((i) => i.clientId === c.id && i.puestosCount > 0).length;
      return { id: c.id, name: c.name, instCount, withPuestos };
    });
  }, [clients, allInstallations]);

  /** Filtered installations based on client selector + search + tab */
  const filteredInstallations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allInstallations.filter((inst) => {
      // Client filter
      if (selectedClientId !== "__all__" && inst.clientId !== selectedClientId) return false;
      // Search
      if (q && !inst.name.toLowerCase().includes(q) && !inst.clientName.toLowerCase().includes(q)) return false;
      // Tab
      if (filterTab === "con_puestos" && inst.puestosCount === 0) return false;
      if (filterTab === "sin_pauta" && (inst.puestosCount === 0 || inst.hasPauta)) return false;
      return true;
    });
  }, [allInstallations, selectedClientId, searchQuery, filterTab]);

  /** Group filtered installations by client */
  const groupedInstallations = useMemo(() => {
    const groups = new Map<string, { clientName: string; installations: InstallationRow[] }>();
    for (const inst of filteredInstallations) {
      if (!groups.has(inst.clientId)) {
        groups.set(inst.clientId, { clientName: inst.clientName, installations: [] });
      }
      groups.get(inst.clientId)!.installations.push(inst);
    }
    return Array.from(groups.entries()).map(([clientId, data]) => ({
      clientId,
      ...data,
    }));
  }, [filteredInstallations]);

  /** Tab counts (respecting client selection + search) */
  const tabCounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = allInstallations.filter((inst) => {
      if (selectedClientId !== "__all__" && inst.clientId !== selectedClientId) return false;
      if (q && !inst.name.toLowerCase().includes(q) && !inst.clientName.toLowerCase().includes(q)) return false;
      return true;
    });
    return {
      all: base.length,
      con_puestos: base.filter((i) => i.puestosCount > 0).length,
      sin_pauta: base.filter((i) => i.puestosCount > 0 && !i.hasPauta).length,
    };
  }, [allInstallations, selectedClientId, searchQuery]);

  /* ── Detail view ── */
  const detailPuestos = useMemo(() => {
    if (!selectedInstallation) return [];
    return puestos.filter((p) => p.installationId === selectedInstallation.id && p.active);
  }, [puestos, selectedInstallation]);

  const fetchData = useCallback(async (installationId: string) => {
    try {
      const [pRes, aRes] = await Promise.all([
        fetch(`/api/ops/puestos?installationId=${installationId}`, { cache: "no-store" }),
        fetch(`/api/ops/asignaciones?installationId=${installationId}&activeOnly=true`, { cache: "no-store" }),
      ]);
      const pData = await pRes.json();
      const aData = await aRes.json();
      if (pRes.ok && pData.success) {
        setPuestos((prev) => {
          const other = prev.filter((p) => p.installationId !== installationId);
          return [...other, ...(pData.data as PuestoItem[])];
        });
      }
      if (aRes.ok && aData.success) {
        setAsignaciones((prev) => {
          const other = prev.filter((a) => a.installationId !== installationId);
          return [...other, ...(aData.data as AsignacionItem[])];
        });
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (selectedInstallation) void fetchData(selectedInstallation.id);
  }, [selectedInstallation, fetchData]);

  /* ── Assignment logic ── */
  const getSlotAssignment = (puestoId: string, slot: number) =>
    asignaciones.find((a) => a.puestoId === puestoId && a.slotNumber === slot && a.isActive);

  const assignedGuardiaIds = useMemo(
    () => new Set(asignaciones.filter((a) => a.isActive).map((a) => a.guardiaId)),
    [asignaciones]
  );

  const availableGuardias = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    return guardias.filter((g) => {
      if (assignedGuardiaIds.has(g.id)) return false;
      if (q) {
        const hay = `${g.persona.firstName} ${g.persona.lastName} ${g.code ?? ""} ${g.persona.rut ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [guardias, assignedGuardiaIds, assignSearch]);

  const openAssign = (puestoId: string, slotNumber: number, puestoName: string) => {
    setAssignTarget({ puestoId, slotNumber, puestoName });
    setAssignGuardiaId("");
    setAssignSearch("");
    setAssignDate(toDateInput(new Date()));
    setAssignWarning(null);
    setAssignModalOpen(true);
  };

  useEffect(() => {
    if (!assignGuardiaId) { setAssignWarning(null); return; }
    const controller = new AbortController();
    fetch("/api/ops/asignaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check", guardiaId: assignGuardiaId }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((payload) => {
        if (payload.success && payload.data?.hasActiveAssignment) {
          setAssignWarning({
            puestoName: payload.data.assignment.puestoName,
            installationName: payload.data.assignment.installationName,
            accountName: payload.data.assignment.accountName,
          });
        } else setAssignWarning(null);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [assignGuardiaId]);

  const handleAssign = async () => {
    if (!assignTarget || !assignGuardiaId) { toast.error("Selecciona un guardia"); return; }
    setAssignSaving(true);
    try {
      const res = await fetch("/api/ops/asignaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guardiaId: assignGuardiaId,
          puestoId: assignTarget.puestoId,
          slotNumber: assignTarget.slotNumber,
          startDate: assignDate,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "Error");
      toast.success("Guardia asignado");
      setAssignModalOpen(false);
      if (selectedInstallation) await fetchData(selectedInstallation.id);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "No se pudo asignar");
    } finally { setAssignSaving(false); }
  };

  const handleUnassign = async () => {
    setUnassignSaving(true);
    try {
      const res = await fetch("/api/ops/asignaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "desasignar",
          asignacionId: unassignConfirm.asignacionId,
          endDate: unassignDate,
          reason: "Desasignado manualmente",
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error || "Error");
      toast.success("Guardia desasignado");
      setUnassignConfirm({ open: false, asignacionId: "", guardiaName: "" });
      if (selectedInstallation) await fetchData(selectedInstallation.id);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "No se pudo desasignar");
    } finally { setUnassignSaving(false); }
  };

  const isNightShift = (shiftStart: string) => {
    const h = parseInt(shiftStart.split(":")[0], 10);
    return h >= 18 || h < 6;
  };

  /* ════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════ */

  /* ── DETAIL VIEW (selected installation) ── */
  if (selectedInstallation) {
    return (
      <div className="space-y-3">
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedInstallation(null)}
                className="h-8 w-8 shrink-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold truncate">{selectedInstallation.name}</h3>
                <p className="text-[11px] text-muted-foreground truncate">{selectedInstallation.clientName}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Link
                  href={`/ops/pauta-mensual?installationId=${selectedInstallation.id}`}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <CalendarDays className="h-3 w-3 text-white" />
                  Pauta
                </Link>
                <Link
                  href={`/crm/installations/${selectedInstallation.id}`}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  CRM
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {detailPuestos.length === 0 ? (
          <Card>
            <CardContent className="py-6">
              <EmptyState
                icon={<Building2 className="h-7 w-7" />}
                title="Sin puestos"
                description="No hay puestos activos. Configúralos desde el CRM."
                action={
                  <Link href={`/crm/installations/${selectedInstallation.id}`}>
                    <Button variant="outline" size="sm" className="text-xs">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Configurar en CRM
                    </Button>
                  </Link>
                }
                compact
              />
            </CardContent>
          </Card>
        ) : (
          detailPuestos.map((puesto) => {
            const night = isNightShift(puesto.shiftStart);
            return (
              <Card key={puesto.id}>
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{puesto.name}</p>
                    <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold border ${
                      night
                        ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                        : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                    }`}>
                      {night ? "N" : "D"}
                    </span>
                    <span className="text-[11px] text-muted-foreground ml-auto shrink-0">
                      {puesto.shiftStart}–{puesto.shiftEnd}
                    </span>
                  </div>

                  {Array.from({ length: puesto.requiredGuards }, (_, i) => i + 1).map((slotNum) => {
                    const assignment = getSlotAssignment(puesto.id, slotNum);
                    return (
                      <div
                        key={slotNum}
                        className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
                          assignment ? "border-border/60" : "border-dashed border-amber-500/30 bg-amber-500/5"
                        }`}
                      >
                        <span className="text-muted-foreground font-mono text-[10px] shrink-0 w-5">{slotNum}</span>
                        <div className="flex-1 min-w-0">
                          {assignment ? (
                            <Link
                              href={`/personas/guardias/${assignment.guardiaId}`}
                              className="font-medium text-xs hover:text-primary transition-colors hover:underline underline-offset-2 truncate block"
                            >
                              {assignment.guardia.persona.firstName} {assignment.guardia.persona.lastName}
                              {assignment.guardia.code && (
                                <span className="text-muted-foreground font-normal ml-1">({assignment.guardia.code})</span>
                              )}
                            </Link>
                          ) : (
                            <span className="text-amber-400/80 italic text-[11px]">Vacante</span>
                          )}
                        </div>
                        <div className="shrink-0">
                          {assignment ? (
                            <Button
                              size="sm" variant="ghost"
                              className="h-6 text-[10px] px-1.5 text-muted-foreground"
                              onClick={() => setUnassignConfirm({
                                open: true,
                                asignacionId: assignment.id,
                                guardiaName: `${assignment.guardia.persona.firstName} ${assignment.guardia.persona.lastName}`,
                              })}
                            >
                              <UserMinus className="h-3 w-3" />
                            </Button>
                          ) : (
                            <Button
                              size="sm" variant="outline"
                              className="h-6 text-[10px] px-1.5"
                              onClick={() => openAssign(puesto.id, slotNum, puesto.name)}
                            >
                              <UserPlus className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })
        )}

        {renderAssignModal()}
        {renderUnassignModal()}
      </div>
    );
  }

  /* ── LIST VIEW (main) ── */
  return (
    <div className="space-y-3">
      {/* ── Controls: client selector + search + tabs ── */}
      <Card>
        <CardContent className="py-3 space-y-2.5">
          {/* Row 1: Client selector + Search */}
          <div className="flex gap-2">
            <div className="w-[45%] sm:w-[200px] shrink-0">
              <SearchableSelect
                value={selectedClientId === "__all__" ? "" : selectedClientId}
                options={clientOptions.map((c) => ({ id: c.id, label: c.name, description: `${c.instCount} instalaciones` }))}
                placeholder={`Todos los clientes (${clients.length})`}
                emptyText="Sin clientes"
                onChange={(val) => setSelectedClientId(val || "__all__")}
              />
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar instalación…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          {/* Row 2: Filter tabs */}
          <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5 w-fit">
            {([
              { key: "all" as FilterTab, label: "Todas", count: tabCounts.all },
              { key: "con_puestos" as FilterTab, label: "Con puestos", count: tabCounts.con_puestos },
              { key: "sin_pauta" as FilterTab, label: "Sin pauta", count: tabCounts.sin_pauta },
            ]).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilterTab(tab.key)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  filterTab === tab.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                <span className="ml-1 opacity-60">{tab.count}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Installations list ── */}
      {filteredInstallations.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <EmptyState
              icon={<Building2 className="h-7 w-7" />}
              title="Sin resultados"
              description={
                searchQuery
                  ? "No se encontraron instalaciones con ese nombre."
                  : filterTab !== "all"
                    ? "No hay instalaciones que coincidan con este filtro."
                    : "No hay instalaciones activas."
              }
              compact
            />
          </CardContent>
        </Card>
      ) : (
        groupedInstallations.map((group) => (
          <div key={group.clientId}>
            {/* Client header — only when showing all clients */}
            {selectedClientId === "__all__" && (
              <div className="flex items-center gap-2 px-1 mb-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.clientName}
                </span>
                <span className="text-[10px] text-muted-foreground/50">
                  {group.installations.length} inst.
                </span>
              </div>
            )}

            <Card className="mb-3">
              <CardContent className="py-0">
                <div className="divide-y divide-border">
                  {group.installations.map((inst) => (
                    <button
                      key={inst.id}
                      type="button"
                      onClick={() => setSelectedInstallation(inst)}
                      className="w-full flex items-center gap-3 py-2.5 px-1 text-left transition-colors hover:bg-accent/40 group"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium truncate block group-hover:text-primary transition-colors">
                          {inst.name}
                        </span>
                        {inst.puestosCount > 0 ? (
                          <span className="text-[11px] text-muted-foreground">
                            {inst.puestosCount} puesto{inst.puestosCount !== 1 ? "s" : ""} · {inst.totalSlots} slot{inst.totalSlots !== 1 ? "s" : ""}
                            {inst.vacantSlots > 0 && (
                              <span className="text-amber-400"> · {inst.vacantSlots} vacante{inst.vacantSlots !== 1 ? "s" : ""}</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/40">Sin puestos</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {inst.puestosCount > 0 && (
                          inst.hasPauta ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[9px] py-0 px-1.5 h-5">
                              {currentMonthLabel}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-[9px] py-0 px-1.5 h-5">
                              Sin pauta
                            </Badge>
                          )
                        )}
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        ))
      )}

      {renderAssignModal()}
      {renderUnassignModal()}
    </div>
  );

  /* ── Shared modals ── */
  function renderAssignModal() {
    return (
      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Asignar guardia</DialogTitle>
            <DialogDescription>
              {assignTarget ? `${assignTarget.puestoName} — Slot ${assignTarget.slotNumber}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Fecha efectiva</Label>
              <input
                type="date"
                value={assignDate}
                onChange={(e) => setAssignDate(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar guardia…" value={assignSearch} onChange={(e) => setAssignSearch(e.target.value)} className="pl-9" />
            </div>
            {assignWarning && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-300">
                Ya asignado a <span className="font-semibold">{assignWarning.puestoName}</span> en{" "}
                <span className="font-semibold">{assignWarning.installationName}</span>. Al confirmar, se cerrará esa asignación.
              </div>
            )}
            <div className="max-h-[220px] overflow-y-auto space-y-0.5 rounded-md border border-border p-1">
              {availableGuardias.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Sin guardias disponibles</p>
              ) : availableGuardias.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setAssignGuardiaId(g.id)}
                  className={`w-full text-left rounded px-2.5 py-1.5 text-xs transition-colors ${
                    assignGuardiaId === g.id ? "bg-primary/15 border border-primary/30" : "hover:bg-accent border border-transparent"
                  }`}
                >
                  <span className="font-medium">{g.persona.firstName} {g.persona.lastName}</span>
                  {g.code && <span className="text-muted-foreground ml-1">({g.code})</span>}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleAssign} disabled={assignSaving || !assignGuardiaId}>
              {assignSaving ? "Asignando…" : "Asignar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  function renderUnassignModal() {
    return (
      <Dialog open={unassignConfirm.open} onOpenChange={(open) => {
        if (open) setUnassignDate(toDateInput(new Date()));
        setUnassignConfirm((p) => ({ ...p, open }));
      }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Desasignar guardia</DialogTitle>
            <DialogDescription>¿Desasignar a {unassignConfirm.guardiaName}?</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Fecha efectiva</Label>
              <input type="date" value={unassignDate} onChange={(e) => setUnassignDate(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
              <p className="text-[10px] text-muted-foreground">Se limpiará la pauta desde esta fecha.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnassignConfirm((p) => ({ ...p, open: false }))}>Cancelar</Button>
            <Button variant="destructive" onClick={handleUnassign} disabled={unassignSaving}>
              {unassignSaving ? "Desasignando…" : "Desasignar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
}
