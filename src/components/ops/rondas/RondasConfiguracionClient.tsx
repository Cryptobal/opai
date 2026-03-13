"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MapPin, FileText, Clock } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { CheckpointMapCreator } from "@/components/ops/rondas/CheckpointMapCreator";
import { RondaTemplateForm, type EditingTemplate } from "@/components/ops/rondas/ronda-template-form";
import { ProgramacionForm, type EditingProgramacion } from "@/components/ops/rondas/programacion-form";
import { DataTable } from "@/components/opai";
import type { DataTableColumn } from "@/components/opai";
import { Button } from "@/components/ui/button";

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
  installationStats = [],
}: {
  installations: Installation[];
  clients: Client[];
  installationStats?: { installationId: string; checkpointCount: number }[];
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

  const installationsWithCheckpoints = useMemo(() => {
    const statsMap = new Map(installationStats.map((s) => [s.installationId, s.checkpointCount]));
    return installations
      .filter((i) => statsMap.has(i.id))
      .map((i) => ({ ...i, checkpointCount: statsMap.get(i.id)! }))
      .sort((a, b) => b.checkpointCount - a.checkpointCount);
  }, [installations, installationStats]);

  const installationsWithoutCheckpoints = useMemo(() => {
    const withSet = new Set(installationStats.map((s) => s.installationId));
    return installations.filter((i) => !withSet.has(i.id));
  }, [installations, installationStats]);

  const selectedInstallation = useMemo(
    () => installations.find((i) => i.id === installationId),
    [installations, installationId],
  );

  const checkpointOptions = useMemo(
    () => checkpoints.filter((c: any) => c.isActive).map((c: any) => ({ id: c.id, name: c.name, lat: c.lat as number | null, lng: c.lng as number | null })),
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
    const instId = params.get("installationId");
    if (instId && installations.some((i) => i.id === instId)) {
      setInstallationId(instId);
    }
  }, [installations]);

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
      {/* Sticky header: selectors + summary badges */}
      <div className="sticky top-0 z-10 bg-[#0a0e1a] pb-2 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-48">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b] mb-1">Cliente</p>
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
          <div className="w-64">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b] mb-1">Instalación</p>
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
          {installationId && !loading && (
            <div className="flex gap-2 flex-wrap ml-auto">
              {[
                { label: "checkpoints", value: checkpoints.filter((c: any) => c.isActive).length, color: "#a855f7" },
                { label: "plantillas",  value: templates.length,    color: "#2dd4bf" },
                { label: "programaciones activas", value: programaciones.filter((p: any) => p.isActive).length, color: "#3b82f6" },
              ].map((s) => (
                <span key={s.label} className="text-[11px] text-[#94a3b8] border border-[#1e293b] rounded-full px-2.5 py-0.5">
                  <span className="font-bold" style={{ color: s.color }}>{s.value}</span>{" "}{s.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Wizard step tabs */}
        {installationId && (
          <div className="flex rounded-xl border border-[#1e293b] overflow-hidden">
            {TABS.map((step, i) => {
              const isActive = activeTab === step.id;
              const stepDone = {
                checkpoints: checkpoints.filter((c: any) => c.isActive).length > 0,
                plantillas: templates.length > 0,
                programacion: programaciones.length > 0,
              }[step.id] ?? false;
              const Icon = step.icon;
              return (
                <button
                  key={step.id}
                  onClick={() => setActiveTab(step.id)}
                  className={[
                    "flex-1 flex flex-col sm:flex-row items-center justify-center gap-2 px-3 py-3 text-center transition-colors border-r border-[#1e293b] last:border-r-0",
                    isActive ? "bg-[#2dd4bf]/10 text-[#2dd4bf]" : "bg-[#111827] text-[#94a3b8] hover:text-[#f1f5f9]",
                  ].join(" ")}
                >
                  <span className={[
                    "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
                    stepDone ? "bg-green-500/20 text-green-400" : isActive ? "bg-[#2dd4bf]/20 text-[#2dd4bf]" : "bg-white/10 text-[#64748b]",
                  ].join(" ")}>
                    {stepDone ? "✓" : i + 1}
                  </span>
                  <div className="flex flex-col items-center sm:items-start">
                    <span className="text-[13px] font-semibold">{step.label}</span>
                    <span className="text-[10px] text-[#64748b] hidden lg:block">
                      {step.id === "checkpoints" ? "Define los puntos de control" : step.id === "plantillas" ? "Agrupa checkpoints en rutas" : "Programa cuándo se ejecutan"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-4 text-[#64748b]">
          <div className="w-4 h-4 rounded-full border-2 border-[#2dd4bf] border-t-transparent animate-spin" />
          <span className="text-[13px]">Cargando...</span>
        </div>
      )}

      {/* CHECKPOINTS TAB */}
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
            setCheckpoints((prev) => [...prev, json.data]);
            toast.success("Checkpoint creado");
            return json.data.id as string;
          }}
          onUpdate={async (id, payload) => {
            const res = await fetch(`/api/ops/rondas/checkpoints/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok || !json.success) { toast.error(json.error ?? "Error"); return; }
            setCheckpoints((prev) => prev.map((c) => c.id === id ? { ...c, ...json.data } : c));
            toast.success("Checkpoint actualizado");
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

      {/* PLANTILLAS TAB */}
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

          {templates.length === 0 && (
            <p className="text-[13px] text-[#94a3b8] py-2">Sin plantillas creadas.</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {templates.map((tpl) => (
              <div key={tpl.id} className="rounded-xl border border-[#1e293b] bg-[#111827] p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[13px] font-semibold text-[#f1f5f9] truncate">{tpl.name}</h4>
                  <span className={[
                    "text-[10px] font-semibold rounded-full border px-2 py-0.5 shrink-0",
                    tpl.isActive !== false
                      ? "bg-green-500/10 text-green-400 border-green-500/20"
                      : "bg-white/5 text-[#94a3b8] border-white/10",
                  ].join(" ")}>
                    {tpl.isActive !== false ? "Activa" : "Inactiva"}
                  </span>
                </div>
                <p className="text-[11px] text-[#94a3b8]">
                  {tpl.orderMode === "strict" ? "Secuencial" : "Flexible"}
                  {tpl.estimatedDurationMin ? ` · ~${tpl.estimatedDurationMin} min` : ""}
                  {` · ${tpl.checkpoints?.length ?? 0} checkpoints`}
                </p>
                {tpl.checkpoints?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tpl.checkpoints.map((tc: any, i: number) => (
                      <span key={tc.checkpoint?.id ?? i} className="inline-flex items-center gap-1 rounded-full bg-[#2dd4bf]/10 border border-[#2dd4bf]/20 px-2 py-0.5 text-[10px] text-[#2dd4bf]">
                        <span className="font-bold">{i + 1}</span>
                        {tc.checkpoint?.name ?? "?"}
                        {i < tpl.checkpoints.length - 1 && tpl.orderMode === "strict" && (
                          <span className="text-[#2dd4bf]/50 ml-0.5">→</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-1.5 pt-0.5">
                  <button
                    className="text-[11px] px-2.5 py-1 rounded-lg border border-[#1e293b] text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#2dd4bf]/40 transition-colors"
                    onClick={() => {
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
                    }}
                  >
                    Editar
                  </button>
                  <button
                    className="text-[11px] px-2.5 py-1 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
                    onClick={async () => {
                      const res = await fetch(`/api/ops/rondas/templates/${tpl.id}`, { method: "DELETE" });
                      if (res.ok) {
                        setTemplates((prev) => prev.filter((t) => t.id !== tpl.id));
                        toast.success("Eliminada");
                      }
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PROGRAMACIÓN TAB */}
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

      {/* No installation selected — show quick access split by checkpoint status */}
      {!installationId && (
        <div className="space-y-6">
          {/* ── Con checkpoints ── */}
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b]">
              Instalaciones con checkpoints{installationsWithCheckpoints.length > 0 && ` (${installationsWithCheckpoints.length})`}
            </p>
            {installationsWithCheckpoints.length === 0 ? (
              <p className="text-[13px] text-[#94a3b8] py-1">Ninguna instalación tiene checkpoints configurados aún.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {installationsWithCheckpoints.map((inst) => (
                  <button
                    key={inst.id}
                    type="button"
                    onClick={() => {
                      if (inst.accountId) setClientId(inst.accountId);
                      setInstallationId(inst.id);
                    }}
                    className="flex items-start gap-3 rounded-xl border border-[#1e293b] bg-[#111827] p-4 text-left transition-colors hover:border-[#2dd4bf]/40 hover:bg-[#2dd4bf]/5"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#2dd4bf]/10">
                      <MapPin className="h-5 w-5 text-[#2dd4bf]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[#f1f5f9] truncate">{inst.name}</p>
                      {inst.address && (
                        <p className="text-[11px] text-[#64748b] truncate">{inst.address}</p>
                      )}
                      <p className="mt-1 text-[11px]">
                        <span className="font-bold text-[#a855f7]">{inst.checkpointCount}</span>
                        <span className="text-[#64748b]"> checkpoint{inst.checkpointCount !== 1 ? "s" : ""}</span>
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Sin checkpoints ── */}
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-[#64748b]">
              Instalaciones sin checkpoints{installationsWithoutCheckpoints.length > 0 && ` (${installationsWithoutCheckpoints.length})`}
            </p>
            {installationsWithoutCheckpoints.length === 0 ? (
              <p className="text-[13px] text-[#94a3b8] py-1">Todas las instalaciones tienen checkpoints configurados. ✓</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {installationsWithoutCheckpoints.map((inst) => (
                  <button
                    key={inst.id}
                    type="button"
                    onClick={() => {
                      if (inst.accountId) setClientId(inst.accountId);
                      setInstallationId(inst.id);
                    }}
                    className="flex items-start gap-3 rounded-xl border border-[#1e293b]/60 bg-[#111827]/60 p-4 text-left transition-colors hover:border-[#64748b]/40 hover:bg-white/5"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5">
                      <MapPin className="h-5 w-5 text-[#64748b]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[#94a3b8] truncate">{inst.name}</p>
                      {inst.address && (
                        <p className="text-[11px] text-[#64748b] truncate">{inst.address}</p>
                      )}
                      <p className="mt-1 text-[11px] text-[#64748b]">Sin checkpoints</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
