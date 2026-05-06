"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckpointForm } from "@/components/ops/rondas/checkpoint-form";
import { CheckpointQrGenerator } from "@/components/ops/rondas/checkpoint-qr-generator";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyState, type DataTableColumn } from "@/components/opai-ds";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { MapPin, FileDown, Archive } from "lucide-react";
import { generateQrsPdf, generateQrsZip } from "@/lib/qr-export";

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
  const [downloadingAll, setDownloadingAll] = useState(false);
  const installationMap = useMemo(() => new Map(installations.map((i) => [i.id, i])), [installations]);
  const selectedInstallation = installationMap.get(installationId);

  const filtered = useMemo(
    () => rows.filter((r) => !installationId || r.installationId === installationId),
    [rows, installationId],
  );

  const columns: DataTableColumn<Checkpoint>[] = [
    {
      id: "name",
      header: "Nombre",
      cell: (row) => (
        <div>
          <p className="font-medium">{row.name}</p>
          {row.description && <p className="text-muted-foreground">{row.description}</p>}
        </div>
      ),
    },
    { id: "qrCode", header: "QR", cell: (row) => <span className="font-mono">{row.qrCode}</span> },
    { id: "geoRadiusM", header: "Radio", cell: (row) => `${row.geoRadiusM}m` },
    { id: "isActive", header: "Estado", cell: (row) => (row.isActive ? "Activo" : "Inactivo") },
    {
      id: "actions",
      header: "Acciones",
      align: "right",
      cell: (row) => (
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
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-ds-md bg-ds-surface-1 border border-ds-border-default">
        <SearchableSelect
          value={installationId}
          options={installations.map((inst) => ({
            id: inst.id,
            label: inst.name,
          }))}
          placeholder="Seleccionar instalación..."
          onChange={(val) => setInstallationId(val)}
        />
      </div>

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
            setRows((prev) => [...prev, json.data]);
            toast.success("Checkpoint creado");
          }}
        />
      )}

      {filtered.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={downloadingAll}
            onClick={async () => {
              const items = filtered
                .filter((cp) => cp.isActive)
                .map((cp) => ({ name: cp.name, code: cp.qrCode }));
              if (items.length === 0) {
                toast.warning("No hay checkpoints activos con QR");
                return;
              }
              setDownloadingAll(true);
              try {
                await generateQrsPdf(items, selectedInstallation?.name ?? "Instalación");
                toast.success(`PDF con ${items.length} QRs descargado`);
              } catch (e) {
                console.error(e);
                toast.error("Error al generar PDF");
              } finally {
                setDownloadingAll(false);
              }
            }}
          >
            <FileDown className="mr-1.5 h-4 w-4" />
            {downloadingAll ? "Generando..." : "Descargar PDF de todos los QR"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={downloadingAll}
            onClick={async () => {
              const items = filtered
                .filter((cp) => cp.isActive)
                .map((cp) => ({ name: cp.name, code: cp.qrCode }));
              if (items.length === 0) {
                toast.warning("No hay checkpoints activos con QR");
                return;
              }
              setDownloadingAll(true);
              try {
                await generateQrsZip(items, selectedInstallation?.name ?? "Instalación");
                toast.success(`ZIP con ${items.length} QRs descargado`);
              } catch (e) {
                console.error(e);
                toast.error("Error al generar ZIP");
              } finally {
                setDownloadingAll(false);
              }
            }}
          >
            <Archive className="mr-1.5 h-4 w-4" />
            ZIP de PNGs
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(row) => row.id}
        empty={<EmptyState icon={MapPin} title="Sin checkpoints para esta instalación." compact />}
      />
    </div>
  );
}
