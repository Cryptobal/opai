"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Check, Loader2, MapPin, Search, Users } from "lucide-react";

interface Supervisor {
  id: string;
  name: string | null;
  email: string;
}

interface Installation {
  id: string;
  name: string;
  address: string | null;
  commune: string | null;
  accountName: string;
}

interface Assignment {
  id: string;
  supervisorId: string;
  installationId: string;
  isActive: boolean;
  notes: string | null;
  supervisor: { id: string; name: string | null; email: string };
  installation: { id: string; name: string; address: string | null; commune: string | null };
}

interface Props {
  supervisors: Supervisor[];
  installations: Installation[];
}

type GroupBy = "client" | "region";

export function SupervisorAssignmentsClient({ supervisors, installations }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSupervisor, setSelectedSupervisor] = useState(supervisors[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("client");

  const fetchAssignments = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/ops/supervision/assignments");
      const json = await res.json();
      if (res.ok && json.success) {
        setAssignments(json.data);
      }
    } catch {
      if (!silent) toast.error("Error al cargar asignaciones");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAssignments();
  }, [fetchAssignments]);

  const assignmentsForSupervisor = useMemo(
    () => assignments.filter((a) => a.supervisorId === selectedSupervisor),
    [assignments, selectedSupervisor],
  );

  const assignedByInstallationId = useMemo(() => {
    const map = new Map<string, Assignment>();
    for (const a of assignmentsForSupervisor) map.set(a.installationId, a);
    return map;
  }, [assignmentsForSupervisor]);

  const filteredInstallations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return installations;
    return installations.filter((inst) => {
      const haystack = `${inst.name} ${inst.accountName} ${inst.commune ?? ""} ${inst.address ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [installations, search]);

  const groupedFilteredInstallations = useMemo(() => {
    const grouped: Record<string, Installation[]> = {};
    for (const inst of filteredInstallations) {
      const key =
        groupBy === "region"
          ? inst.commune || "Sin región"
          : inst.accountName || "Sin cliente";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(inst);
    }
    // Sort keys alphabetically
    return Object.fromEntries(Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)));
  }, [filteredInstallations, groupBy]);

  const handleToggle = async (installationId: string, checked: boolean) => {
    if (!selectedSupervisor) {
      toast.error("Selecciona un usuario primero");
      return;
    }
    setUpdatingIds((prev) => {
      const next = new Set(prev);
      next.add(installationId);
      return next;
    });

    const prevAssignments = assignments;

    // Optimistic update
    if (checked) {
      const sup = supervisors.find((s) => s.id === selectedSupervisor);
      const inst = installations.find((i) => i.id === installationId);
      if (sup && inst) {
        setAssignments((prev) => [
          ...prev,
          {
            id: `temp-${selectedSupervisor}-${installationId}`,
            supervisorId: selectedSupervisor,
            installationId,
            isActive: true,
            notes: null,
            supervisor: { id: sup.id, name: sup.name, email: sup.email },
            installation: {
              id: inst.id,
              name: inst.name,
              address: inst.address,
              commune: inst.commune,
            },
          },
        ]);
      }
    } else {
      setAssignments((prev) =>
        prev.filter((a) => !(a.supervisorId === selectedSupervisor && a.installationId === installationId)),
      );
    }

    try {
      if (checked) {
        const res = await fetch("/api/ops/supervision/assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supervisorId: selectedSupervisor,
            installationId,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Error");
        // Replace temp assignment with real one from API response
        if (json.data) {
          setAssignments((prev) =>
            prev.map((a) =>
              a.id === `temp-${selectedSupervisor}-${installationId}` ? json.data : a,
            ),
          );
        }
        toast.success("Instalación asignada");
      } else {
        const assignment = assignedByInstallationId.get(installationId);
        if (!assignment) throw new Error("No se encontró la asignación para remover");
        // If it was a temp (just created and toggled back quickly), just clear it
        if (assignment.id.startsWith("temp-")) {
          toast.success("Asignación removida");
          return;
        }
        const res = await fetch(`/api/ops/supervision/assignments?id=${assignment.id}`, {
          method: "DELETE",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Error");
        toast.success("Asignación removida");
      }
    } catch (err) {
      setAssignments(prevAssignments);
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar la asignación");
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(installationId);
        return next;
      });
    }
  };

  const handleSetAllVisible = async (assign: boolean) => {
    if (!selectedSupervisor) {
      toast.error("Selecciona un usuario primero");
      return;
    }

    const targetIds = filteredInstallations
      .filter((inst) => (assign ? !assignedByInstallationId.has(inst.id) : assignedByInstallationId.has(inst.id)))
      .map((inst) => inst.id);

    if (targetIds.length === 0) {
      toast.info(assign ? "Todas las instalaciones visibles ya están asignadas" : "No hay instalaciones visibles asignadas");
      return;
    }

    setBulkUpdating(true);
    setUpdatingIds((prev) => {
      const next = new Set(prev);
      for (const id of targetIds) next.add(id);
      return next;
    });

    const prevAssignments = assignments;
    const assignmentMap = new Map(assignedByInstallationId);

    // Optimistic
    if (assign) {
      const sup = supervisors.find((s) => s.id === selectedSupervisor);
      if (sup) {
        const tempRows = targetIds
          .map((installationId) => {
            const inst = installations.find((i) => i.id === installationId);
            if (!inst) return null;
            return {
              id: `temp-${selectedSupervisor}-${installationId}`,
              supervisorId: selectedSupervisor,
              installationId,
              isActive: true,
              notes: null,
              supervisor: { id: sup.id, name: sup.name, email: sup.email },
              installation: {
                id: inst.id,
                name: inst.name,
                address: inst.address,
                commune: inst.commune,
              },
            } satisfies Assignment;
          })
          .filter(Boolean) as Assignment[];
        setAssignments((prev) => [...prev, ...tempRows]);
      }
    } else {
      setAssignments((prev) =>
        prev.filter((a) => !(a.supervisorId === selectedSupervisor && targetIds.includes(a.installationId))),
      );
    }

    try {
      if (assign) {
        const results = await Promise.all(
          targetIds.map(async (installationId) => {
            const res = await fetch("/api/ops/supervision/assignments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ supervisorId: selectedSupervisor, installationId }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? "Error");
            return json.data as Assignment | undefined;
          }),
        );
        // Replace temp IDs with real ones from responses
        setAssignments((prev) => {
          const realById = new Map<string, Assignment>();
          for (const a of results) {
            if (a) realById.set(a.installationId, a);
          }
          return prev.map((a) => {
            if (a.id.startsWith("temp-") && realById.has(a.installationId)) {
              return realById.get(a.installationId)!;
            }
            return a;
          });
        });
      } else {
        await Promise.all(
          targetIds.map(async (installationId) => {
            const assignment = assignmentMap.get(installationId);
            if (!assignment || assignment.id.startsWith("temp-")) return;
            const res = await fetch(`/api/ops/supervision/assignments?id=${assignment.id}`, { method: "DELETE" });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? "Error");
          }),
        );
      }

      toast.success(assign ? `Asignadas ${targetIds.length} instalaciones` : `Removidas ${targetIds.length} asignaciones`);
    } catch (err) {
      setAssignments(prevAssignments);
      toast.error(err instanceof Error ? err.message : "No se pudo completar la operación masiva");
    } finally {
      setBulkUpdating(false);
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        for (const id of targetIds) next.delete(id);
        return next;
      });
    }
  };

  const selectedUserName =
    supervisors.find((s) => s.id === selectedSupervisor)?.name ??
    supervisors.find((s) => s.id === selectedSupervisor)?.email ??
    "Usuario";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Asignar instalaciones por usuario</CardTitle>
          <CardDescription>
            Selecciona un usuario y activa/desactiva instalaciones con un click.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 items-end">
            <div>
              <Label className="text-xs">Usuario</Label>
              <Select value={selectedSupervisor} onValueChange={setSelectedSupervisor}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Seleccionar usuario" />
                </SelectTrigger>
                <SelectContent>
                  {supervisors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name ?? s.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Buscar instalación</Label>
              <div className="relative mt-1">
                <Search className="h-4 w-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nombre, comuna o dirección..."
                  className="pl-8"
                />
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!selectedSupervisor || loading || bulkUpdating}
              onClick={() => void handleSetAllVisible(true)}
            >
              Seleccionar todas visibles
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!selectedSupervisor || loading || bulkUpdating}
              onClick={() => void handleSetAllVisible(false)}
            >
              Quitar todas visibles
            </Button>
            <div className="ml-auto flex items-center gap-1 rounded-md border border-border p-0.5">
              <button
                type="button"
                onClick={() => setGroupBy("client")}
                className={[
                  "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors",
                  groupBy === "client"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                <Users className="h-3 w-3" />
                Por cliente
              </button>
              <button
                type="button"
                onClick={() => setGroupBy("region")}
                className={[
                  "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors",
                  groupBy === "region"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                <MapPin className="h-3 w-3" />
                Por región
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Instalaciones</CardTitle>
          <CardDescription>
            {assignmentsForSupervisor.length} de {installations.length} asignadas a {selectedUserName}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredInstallations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Sin resultados para tu búsqueda.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedFilteredInstallations).map(([groupKey, groupInstallations]) => (
                <div key={groupKey}>
                  <div className="px-1 pb-2 flex items-center gap-1.5">
                    {groupBy === "region" ? (
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <Users className="h-3 w-3 text-muted-foreground" />
                    )}
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {groupKey}
                    </p>
                    <span className="text-xs text-muted-foreground/60 ml-auto">
                      {groupInstallations.filter((i) => assignedByInstallationId.has(i.id)).length}/{groupInstallations.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {groupInstallations.map((inst) => {
                      const assigned = assignedByInstallationId.has(inst.id);
                      const isUpdating = updatingIds.has(inst.id);
                      return (
                        <div
                          key={inst.id}
                          className="flex items-center justify-between rounded-md border border-border px-3 py-2.5"
                        >
                          <div className="min-w-0 pr-3">
                            <p className="text-sm font-medium truncate">{inst.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {groupBy === "region"
                                ? inst.accountName
                                : inst.commune
                                ? `${inst.commune} · ${inst.address ?? "Sin dirección"}`
                                : (inst.address ?? "Sin dirección")}
                            </p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={assigned}
                            disabled={isUpdating || !selectedSupervisor || bulkUpdating}
                            onClick={() => void handleToggle(inst.id, !assigned)}
                            className={[
                              "relative inline-flex h-7 w-14 items-center rounded-full transition-colors",
                              assigned ? "bg-emerald-500/80" : "bg-muted",
                              isUpdating ? "opacity-70 cursor-not-allowed" : "cursor-pointer",
                            ].join(" ")}
                          >
                            <span
                              className={[
                                "inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white transition-transform",
                                assigned ? "translate-x-8 text-emerald-600" : "translate-x-1 text-muted-foreground",
                              ].join(" ")}
                            >
                              {isUpdating ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : assigned ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : null}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
