"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckpointForm } from "@/components/ops/rondas/checkpoint-form";
import { CheckpointQrGenerator } from "@/components/ops/rondas/checkpoint-qr-generator";
import { Button } from "@/components/ui/button";
import { DataTable, FilterBar } from "@/components/opai";
import type { DataTableColumn } from "@/components/opai";

interface Installation {
  id: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}

interface Checkpoint {
  id: string;
  installationId: string;
  name: string;
  description: string | null;
  qrCode: string;
  geoRadiusM: number;
  isActive: boolean;
}

export function RondasCheckpointsClient({
  installations,
  initialCheckpoints,
}: {
  installations: Installation[];
  initialCheckpoints: Checkpoint[];
}) {
  const [installationId, setInstallationId] = useState(installations[0]?.id ?? "");
  const [rows, setRows] = useState(initialCheckpoints);
  const installationMap = useMemo(() => new Map(installations.map((i) => [i.id, i])), [installations]);
  const selectedInstallation = installationMap.get(installationId);

  const filtered = useMemo(
    () => rows.filter((r) => !installationId || r.installationId === installationId),
    [rows, installationId],
  );

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
    { key: "qrCode", label: "QR", className: "font-mono" },
    { key: "geoRadiusM", label: "Radio", render: (v) => `${v}m` },
    { key: "isActive", label: "Estado", render: (v) => (v ? "Activo" : "Inactivo") },
    {
      key: "actions",
      label: "Acciones",
      className: "text-right",
      render: (_v, row) => (
        <div className="flex gap-1 justify-end">
          <CheckpointQrGenerator
            code={row.qrCode}
            checkpointName={row.name}
            installationName={installationMap.get(row.installationId)?.name}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={async () => {
              const res = await fetch(`/api/ops/rondas/checkpoints/${row.id}`, { method: "DELETE" });
              const json = await res.json();
              if (!res.ok || !json.success) {
                toast.error(json.error ?? "No se pudo eliminar");
                return;
              }
              setRows((prev) => prev.filter((r) => r.id !== row.id));
              toast.success("Checkpoint eliminado");
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
        <select
          className="h-9 rounded border border-border bg-background px-2 text-sm"
          value={installationId}
          onChange={(e) => setInstallationId(e.target.value)}
        >
          {installations.map((inst) => (
            <option key={inst.id} value={inst.id}>{inst.name}</option>
          ))}
        </select>
      </FilterBar>

      {installationId && (
        <CheckpointForm
          installationId={installationId}
          installationName={selectedInstallation?.name}
          installationAddress={selectedInstallation?.address ?? undefined}
          installationLat={selectedInstallation?.lat}
          installationLng={selectedInstallation?.lng}
          onSubmit={async (payload) => {
            const res = await fetch("/api/ops/rondas/checkpoints", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
              toast.error(json.error ?? "No se pudo crear checkpoint");
              return;
            }
            setRows((prev) => [json.data, ...prev]);
            toast.success("Checkpoint creado");
          }}
        />
      )}

      <DataTable
        columns={columns}
        data={filtered}
        emptyMessage="Sin checkpoints para esta instalación."
      />
    </div>
  );
}
