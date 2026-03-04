"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MapPin, FileText, Clock } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { ChipTabs } from "@/components/ui/chip-tabs";
import { FilterBar } from "@/components/opai";
import { CheckpointMapCreator } from "@/components/ops/rondas/CheckpointMapCreator";
import { RondaTemplateForm, type EditingTemplate } from "@/components/ops/rondas/ronda-template-form";
import { ProgramacionForm, type EditingProgramacion } from "@/components/ops/rondas/programacion-form";
import { DataTable } from "@/components/opai";
import type { DataTableColumn } from "@/components/opai";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Client {
  id: string;
  name: string;
}

interface Installation {
  id: string;
  name: string;
  address?: string | null;
  commune?: string | null;
  lat?: number | null;
  lng?: number | null;
  accountId?: string | null;
}

const TABS = [
  { id: "checkpoints", label: "Checkpoints", icon: MapPin },
  { id: "plantillas", label: "Plantillas", icon: FileText },
  { id: "programacion", label: "Programación", icon: Clock },
];

export function RondasConfiguracionClient({
  installations,
  clients,
}: {
  installations: Installation[];
  clients: Client[];
}) {
  const [clientId, setClientId] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [activeTab, setActiveTab] = useState("checkpoints");

  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [programaciones, setProgramaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EditingTemplate | null>(null);
  const [editingProgramacion, setEditingProgramacion] = useState<EditingProgramacion | null>(null);

  const filteredInstallations = useMemo(
    () => clientId ? installations.filter((i) => i.accountId === clientId) : installations,
    [installations, clientId],
  );

  const selectedInstallation = useMemo(
    () => installations.find((i) => i.id === installationId),
    [installations, installationId],
  );

  const checkpointOptions = useMemo(
    () => checkpoints.filter((c: any) => c.isActive).map((c: any) => ({ id: c.id, name: c.name })),
    [checkpoints],
  );

  const templateOptions = useMemo(
    () => templates.filter((t: any) => t.isActive !== false).map((t: any) => ({ id: t.id, name: t.name })),
    [templates],
  );

  const loadData = useCallback(async (instId: string) => {
    if (!instId) return;
    setLoading(true);
    try {
      const [cpRes, tplRes, progRes] = await Promise.all([
        fetch(`/api/ops/rondas/checkpoints?installationId=${encodeURIComponent(instId)}`),
        fetch(`/api/ops/rondas/templates?installationId=${encodeURIComponent(instId)}`),
        fetch(`/api/ops/rondas/programacion`),
      ]);
      const [cpJson, tplJson, progJson] = await Promise.all([cpRes.json(), tplRes.json(), progRes.json()]);
      if (cpJson.success) setCheckpoints(cpJson.data);
      if (tplJson.success) setTemplates(tplJson.data);
      if (progJson.success) {
        const filtered = progJson.data.filter((p: any) =>
          tplJson.success && tplJson.data.some((t: any) => t.id === p.rondaTemplateId)
        );
        setProgramaciones(filtered);
      }
    } catch {
      toast.error("Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (installationId) {
      void loadData(installationId);
    }
  }, [installationId, loadData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab && TABS.some((t) => t.id === tab)) setActiveTab(tab);
  }, []);

  const programacionColumns: DataTableColumn[] = [
    { key: "rondaTemplate", label: "Plantilla", render: (_v, row) => row.rondaTemplate?.name ?? "—" },
    {
      key: "diasSemana",
      label: "Días",
      render: (v) => {
        const labels = ["D", "L", "M", "X", "J", "V", "S"];
        return (v as number[]).map((d) => labels[d]).join(" ");
      },
    },
    { key: "horario", label: "Horario", render: (_v, row) => `${row.horaInicio} - ${row.horaFin}` },
    { key: "frecuenciaMinutos", label: "Frecuencia", render: (v) => `${v} min` },
    { key: "toleranciaMinutos", label: "Tolerancia", render: (v) => `${v} min` },
    {
      key: "isActive",
      label: "Estado",
      render: (v, row) => (
        <Button
          size="sm"
          variant="outline"
          className={`h-7 text-xs ${v ? "text-emerald-500" : "text-muted-foreground"}`}
          onClick={async () => {
            const newState = !v;
            const res = await fetch(`/api/ops/rondas/programacion/${row.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isActive: newState }),
            });
            if (res.ok) {
              setProgramaciones((prev) =>
                prev.map((p) => (p.id === row.id ? { ...p, isActive: newState } : p)),
              );
            }
          }}
        >
          {v ? "Activa" : "Inactiva"}
        </Button>
      ),
    },
    {
      key: "actions",
      label: "",
      className: "text-right",
      render: (_v, row) => (
        <div className="flex gap-1 justify-end">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              setEditingProgramacion({
                id: row.id,
                rondaTemplateId: row.rondaTemplateId,
                diasSemana: row.diasSemana,
                horaInicio: row.horaInicio,
                horaFin: row.horaFin,
                frecuenciaMinutos: row.frecuenciaMinutos,
                toleranciaMinutos: row.toleranciaMinutos,
              });
            }}
          >
            Editar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-red-500"
            onClick={async () => {
              const res = await fetch(`/api/ops/rondas/programacion/${row.id}`, { method: "DELETE" });
              if (res.ok) {
                setProgramaciones((prev) => prev.filter((p) => p.id !== row.id));
                toast.success("Eliminada");
              }
            }}
          >
            Eliminar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <FilterBar>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Cliente</label>
          <SearchableSelect
            value={clientId}
            options={clients.map((c) => ({ id: c.id, label: c.name }))}
            placeholder="Buscar cliente..."
            onChange={(val) => {
              setClientId(val);
              setInstallationId("");
            }}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Instalación</label>
          <SearchableSelect
            value={installationId}
            options={filteredInstallations.map((inst) => ({
              id: inst.id,
              label: `${inst.name}${inst.address ? ` — ${inst.address}` : ""}`,
            }))}
            placeholder="Seleccionar instalación..."
            onChange={(val) => setInstallationId(val)}
          />
        </div>
      </FilterBar>

      <ChipTabs
        tabs={TABS.map((t) => ({ id: t.id, label: t.label, icon: t.icon }))}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {loading && <p className="text-sm text-muted-foreground py-4">Cargando...</p>}

      {!loading && activeTab === "checkpoints" && installationId && (
        <CheckpointMapCreator
          installationId={installationId}
          installationName={selectedInstallation?.name}
          installationLat={selectedInstallation?.lat}
          installationLng={selectedInstallation?.lng}
          checkpoints={checkpoints}
          onSubmit={async (payload) => {
            const res = await fetch("/api/ops/rondas/checkpoints", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok || !json.success) { toast.error(json.error ?? "Error"); return; }
            setCheckpoints((prev) => [json.data, ...prev]);
            toast.success("Checkpoint creado");
          }}
          onToggleActive={async (id, isActive) => {
            const res = await fetch(`/api/ops/rondas/checkpoints/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isActive }),
            });
            if (res.ok) {
              setCheckpoints((prev) => prev.map((c) => c.id === id ? { ...c, isActive } : c));
              toast.success(isActive ? "Activado" : "Desactivado");
            }
          }}
          onDelete={async (id) => {
            const res = await fetch(`/api/ops/rondas/checkpoints/${id}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            if (res.ok) {
              setCheckpoints((prev) => prev.filter((c) => c.id !== id));
              toast.success("Checkpoint eliminado");
            } else {
              toast.error(json?.error ?? "No se pudo eliminar el checkpoint");
            }
          }}
        />
      )}

      {!loading && activeTab === "plantillas" && installationId && (
        <div className="space-y-4">
          <RondaTemplateForm
            key={editingTemplate?.id ?? "new"}
            installationId={installationId}
            checkpoints={checkpointOptions}
            editingTemplate={editingTemplate}
            onCancelEdit={() => setEditingTemplate(null)}
            onSubmit={async (payload) => {
              if (editingTemplate) {
                const res = await fetch(`/api/ops/rondas/templates/${editingTemplate.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
                const json = await res.json();
                if (!res.ok || !json.success) { toast.error(json.error ?? "Error"); return; }
                setEditingTemplate(null);
                await loadData(installationId);
                toast.success("Plantilla actualizada");
              } else {
                const res = await fetch("/api/ops/rondas/templates", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
                const json = await res.json();
                if (!res.ok || !json.success) { toast.error(json.error ?? "Error"); return; }
                await loadData(installationId);
                toast.success("Plantilla creada");
              }
            }}
          />

          {templates.length === 0 && <p className="text-sm text-muted-foreground">Sin plantillas creadas.</p>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {templates.map((tpl) => (
              <div key={tpl.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">{tpl.name}</h4>
                  <Badge variant="outline" className={tpl.isActive !== false ? "text-emerald-500 border-emerald-500/30" : "text-muted-foreground"}>
                    {tpl.isActive !== false ? "Activa" : "Inactiva"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {tpl.orderMode === "strict" ? "Secuencial" : "Flexible"}
                  {tpl.estimatedDurationMin ? ` · ~${tpl.estimatedDurationMin} min` : ""}
                  {` · ${tpl.checkpoints?.length ?? 0} checkpoints`}
                </p>
                {tpl.checkpoints?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tpl.checkpoints.map((tc: any, i: number) => (
                      <span key={tc.checkpoint?.id ?? i} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px]">
                        <span className="font-bold">{i + 1}</span>
                        {tc.checkpoint?.name ?? "?"}
                        {i < tpl.checkpoints.length - 1 && tpl.orderMode === "strict" && (
                          <span className="text-muted-foreground ml-0.5">→</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-1 pt-1">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                    setEditingTemplate({
                      id: tpl.id,
                      name: tpl.name,
                      description: tpl.description,
                      orderMode: tpl.orderMode,
                      estimatedDurationMin: tpl.estimatedDurationMin,
                      checkpoints: tpl.checkpoints?.map((tc: any, i: number) => ({
                        checkpointId: tc.checkpoint?.id ?? tc.checkpointId,
                        orderIndex: tc.orderIndex ?? i,
                      })) ?? [],
                    });
                  }}>
                    Editar
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs text-red-500" onClick={async () => {
                    const res = await fetch(`/api/ops/rondas/templates/${tpl.id}`, { method: "DELETE" });
                    if (res.ok) {
                      setTemplates((prev) => prev.filter((t) => t.id !== tpl.id));
                      toast.success("Eliminada");
                    }
                  }}>
                    Eliminar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && activeTab === "programacion" && installationId && (
        <div className="space-y-4">
          <ProgramacionForm
            key={editingProgramacion?.id ?? "new"}
            templates={templateOptions}
            editingProgramacion={editingProgramacion}
            onCancelEdit={() => setEditingProgramacion(null)}
            onSubmit={async (payload) => {
              if (editingProgramacion) {
                const res = await fetch(`/api/ops/rondas/programacion/${editingProgramacion.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
                const json = await res.json();
                if (!res.ok || !json.success) { toast.error(json.error ?? "Error"); return; }
                setEditingProgramacion(null);
                await loadData(installationId);
                toast.success("Programación actualizada");
              } else {
                const res = await fetch("/api/ops/rondas/programacion", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                });
                const json = await res.json();
                if (!res.ok || !json.success) { toast.error(json.error ?? "Error"); return; }
                const tpl = templateOptions.find((t) => t.id === payload.rondaTemplateId);
                setProgramaciones((prev) => [{ ...json.data, rondaTemplate: tpl ? { name: tpl.name } : null }, ...prev]);
                toast.success("Programación creada");
              }
            }}
          />
          <DataTable columns={programacionColumns} data={programaciones} emptyMessage="Sin programaciones." />
        </div>
      )}

      {!installationId && (
        <p className="text-sm text-muted-foreground py-8 text-center">Selecciona una instalación para configurar rondas.</p>
      )}
    </div>
  );
}
