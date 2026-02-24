"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { RondaTemplateForm } from "@/components/ops/rondas/ronda-template-form";
import { Button } from "@/components/ui/button";

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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <select
          className="h-10 rounded border border-border bg-background px-2 text-sm"
          value={installationId}
          onChange={(e) => void loadInstallationData(e.target.value)}
        >
          {installations.map((installation) => (
            <option key={installation.id} value={installation.id}>
              {installation.name}
            </option>
          ))}
        </select>
      </div>

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

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nombre</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Orden</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Checkpoints</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2">
                    <p className="font-medium">{t.name}</p>
                    {t.description && <p className="text-muted-foreground">{t.description}</p>}
                  </td>
                  <td className="px-3 py-2">{t.orderMode}</td>
                  <td className="px-3 py-2">
                    {t.checkpoints.map((c) => c.checkpoint.name).join(", ")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={async () => {
                        const res = await fetch(`/api/ops/rondas/templates/${t.id}`, { method: "DELETE" });
                        const json = await res.json();
                        if (!res.ok || !json.success) {
                          toast.error(json.error ?? "No se pudo eliminar plantilla");
                          return;
                        }
                        setRows((prev) => prev.filter((r) => r.id !== t.id));
                        toast.success("Plantilla eliminada");
                      }}
                    >
                      Eliminar
                    </Button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    Sin plantillas creadas.
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
