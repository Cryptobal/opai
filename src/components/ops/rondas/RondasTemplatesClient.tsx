"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { RondaTemplateForm } from "@/components/ops/rondas/ronda-template-form";
import { Button } from "@/components/ui/button";
import { DataTable, FilterBar } from "@/components/opai";
import type { DataTableColumn } from "@/components/opai";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

interface InstallationOption {
  id: string;
  name: string;
}

interface CheckpointOption {
  id: string;
  name: string;
}

interface TemplateItem {
  id: string;
  name: string;
  description: string | null;
  orderMode: string;
  checkpoints: { checkpoint: { id: string; name: string } }[];
}

export function RondasTemplatesClient({
  installations,
  initialInstallationId,
  initialCheckpoints,
  initialTemplates,
}: {
  installations: InstallationOption[];
  initialInstallationId: string;
  initialCheckpoints: CheckpointOption[];
  initialTemplates: TemplateItem[];
}) {
  const [installationId, setInstallationId] = useState(initialInstallationId);
  const [checkpoints, setCheckpoints] = useState(initialCheckpoints);
  const [rows, setRows] = useState(initialTemplates);
  const checkpointMap = useMemo(() => new Map(checkpoints.map((c) => [c.id, c.name])), [checkpoints]);

  const loadInstallationData = async (nextInstallationId: string) => {
    setInstallationId(nextInstallationId);
    const [cpRes, tplRes] = await Promise.all([
      fetch(`/api/ops/rondas/checkpoints?installationId=${encodeURIComponent(nextInstallationId)}`),
      fetch(`/api/ops/rondas/templates?installationId=${encodeURIComponent(nextInstallationId)}`),
    ]);
    const cpJson = await cpRes.json();
    const tplJson = await tplRes.json();
    if (!cpRes.ok || !cpJson.success || !tplRes.ok || !tplJson.success) {
      toast.error("No se pudieron cargar datos de la instalación");
      return;
    }
    setCheckpoints(cpJson.data.map((cp: any) => ({ id: cp.id, name: cp.name })));
    setRows(tplJson.data);
  };

  const columns: DataTableColumn[] = [
    {
      key: "name",
      label: "Nombre",
      render: (_v, row) => (
        <div>
          <p className="font-medium">{row.name}</p>
          {row.description && <p className="text-muted-foreground">{row.description}</p>}
        </div>
      ),
    },
    { key: "orderMode", label: "Orden" },
    {
      key: "checkpoints",
      label: "Checkpoints",
      render: (v) => v.map((c: any) => c.checkpoint.name).join(", "),
    },
    {
      key: "actions",
      label: "Acciones",
      className: "text-right",
      render: (_v, row) => (
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={async () => {
            const res = await fetch(`/api/ops/rondas/templates/${row.id}`, { method: "DELETE" });
            const json = await res.json();
            if (!res.ok || !json.success) {
              toast.error(json.error ?? "No se pudo eliminar plantilla");
              return;
            }
            setRows((prev) => prev.filter((r) => r.id !== row.id));
            toast.success("Plantilla eliminada");
          }}
        >
          Eliminar
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <FilterBar>
        <SearchableSelect
          value={installationId}
          options={installations.map((installation) => ({
            id: installation.id,
            label: installation.name,
          }))}
          placeholder="Seleccionar instalación..."
          onChange={(val) => { void loadInstallationData(val); }}
        />
      </FilterBar>

      <RondaTemplateForm
        installationId={installationId}
        checkpoints={checkpoints}
        onSubmit={async (payload) => {
          const res = await fetch("/api/ops/rondas/templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const json = await res.json();
          if (!res.ok || !json.success) {
            toast.error(json.error ?? "No se pudo crear plantilla");
            return;
          }
          setRows((prev) => [{ ...json.data, checkpoints: payload.checkpointIds.map((id) => ({ checkpoint: { id, name: checkpointMap.get(id) ?? id } })) }, ...prev]);
          toast.success("Plantilla creada");
        }}
      />

      <DataTable
        columns={columns}
        data={rows}
        emptyMessage="Sin plantillas creadas."
      />
    </div>
  );
}
