"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckpointForm } from "@/components/ops/rondas/checkpoint-form";
import { CheckpointQrGenerator } from "@/components/ops/rondas/checkpoint-qr-generator";
import { Button } from "@/components/ui/button";

interface Installation {
  id: string;
  name: string;
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

  const filtered = useMemo(
    () => rows.filter((r) => !installationId || r.installationId === installationId),
    [rows, installationId],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <select
          className="h-10 rounded border border-border bg-background px-2 text-sm"
          value={installationId}
          onChange={(e) => setInstallationId(e.target.value)}
        >
          {installations.map((inst) => (
            <option key={inst.id} value={inst.id}>{inst.name}</option>
          ))}
        </select>
      </div>

      {installationId && (
        <CheckpointForm
          installationId={installationId}
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

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">Nombre</th>
                <th className="px-3 py-2 text-left">QR</th>
                <th className="px-3 py-2 text-left">Radio</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((cp) => (
                <tr key={cp.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <p className="font-medium">{cp.name}</p>
                    {cp.description && <p className="text-muted-foreground">{cp.description}</p>}
                  </td>
                  <td className="px-3 py-2 font-mono">{cp.qrCode}</td>
                  <td className="px-3 py-2">{cp.geoRadiusM}m</td>
                  <td className="px-3 py-2">{cp.isActive ? "Activo" : "Inactivo"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 justify-end">
                      <CheckpointQrGenerator code={cp.qrCode} label={cp.name} />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={async () => {
                          const res = await fetch(`/api/ops/rondas/checkpoints/${cp.id}`, { method: "DELETE" });
                          const json = await res.json();
                          if (!res.ok || !json.success) {
                            toast.error(json.error ?? "No se pudo eliminar");
                            return;
                          }
                          setRows((prev) => prev.filter((r) => r.id !== cp.id));
                          toast.success("Checkpoint eliminado");
                        }}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    Sin checkpoints para esta instalación.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
