"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, MapPin, User, Loader2 } from "lucide-react";

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

export function SupervisorAssignmentsClient({ supervisors, installations }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedSupervisor, setSelectedSupervisor] = useState("");
  const [selectedInstallation, setSelectedInstallation] = useState("");

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ops/supervision/assignments");
      const json = await res.json();
      if (res.ok && json.success) {
        setAssignments(json.data);
      }
    } catch {
      toast.error("Error al cargar asignaciones");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAssignments();
  }, [fetchAssignments]);

  const handleAdd = async () => {
    if (!selectedSupervisor || !selectedInstallation) {
      toast.error("Selecciona supervisor e instalación");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/ops/supervision/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supervisorId: selectedSupervisor,
          installationId: selectedInstallation,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      toast.success("Asignación creada");
      setSelectedSupervisor("");
      setSelectedInstallation("");
      void fetchAssignments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      const res = await fetch(`/api/ops/supervision/assignments?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      toast.success("Asignación removida");
      void fetchAssignments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al remover");
    }
  };

  const groupedBySupervisor = assignments.reduce<Record<string, Assignment[]>>((acc, a) => {
    const key = a.supervisor.name ?? a.supervisor.email;
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nueva asignación</CardTitle>
          <CardDescription>
            Asigna una instalación a un supervisor para que pueda hacer check-in y reportar visitas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <Label className="text-xs">Supervisor</Label>
              <Select value={selectedSupervisor} onValueChange={setSelectedSupervisor}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Seleccionar supervisor" />
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
              <Label className="text-xs">Instalación</Label>
              <Select value={selectedInstallation} onValueChange={setSelectedInstallation}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Seleccionar instalación" />
                </SelectTrigger>
                <SelectContent>
                  {installations.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                      {i.commune ? ` · ${i.commune}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAdd} disabled={saving || !selectedSupervisor || !selectedInstallation}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Asignar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Asignaciones activas</CardTitle>
          <CardDescription>
            {assignments.length} asignación{assignments.length !== 1 ? "es" : ""} activa{assignments.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No hay asignaciones. Usa el formulario de arriba para asignar instalaciones a supervisores.
            </p>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedBySupervisor).map(([supervisorName, supervisorAssignments]) => (
                <div key={supervisorName}>
                  <div className="flex items-center gap-2 mb-2">
                    <User className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">{supervisorName}</span>
                    <span className="text-xs text-muted-foreground">
                      ({supervisorAssignments.length} instalación{supervisorAssignments.length !== 1 ? "es" : ""})
                    </span>
                  </div>
                  <div className="space-y-1.5 pl-6">
                    {supervisorAssignments.map((a) => (
                      <div key={a.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm truncate">{a.installation.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {a.installation.address ?? a.installation.commune ?? "Sin dirección"}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2"
                          onClick={() => handleRemove(a.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
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
