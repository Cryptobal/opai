"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Surface } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";

type DriveStatus = {
  connected: boolean;
  hasFolder: boolean;
  folderUrl: string | null;
  fileCount: number;
};

type Props = { dealId: string };

export function DealDriveBanner({ dealId }: Props) {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/crm/deals/${dealId}/drive`);
      const json = await res.json();
      if (json.success) setStatus(json.data);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    setLoading(true);
    void fetchStatus();
  }, [fetchStatus]);

  async function handleCreate() {
    setWorking(true);
    try {
      const res = await fetch(`/api/crm/deals/${dealId}/drive`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "No se pudo crear la carpeta");
      const { uploaded, skipped, total } = json.data;
      toast.success(
        total === 0
          ? "Carpeta creada en Google Drive"
          : `Carpeta creada — ${uploaded} subido(s), ${skipped} omitido(s)`,
      );
      await fetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear carpeta");
    } finally {
      setWorking(false);
    }
  }

  if (loading) return null;

  if (!status?.connected) {
    return (
      <p className="mb-3 text-[12px] text-ds-text-4">
        Conectá Google Drive en Configuración para espejar documentos del negocio.
      </p>
    );
  }

  return (
    <Surface elevation={1} padding="sm" className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-[13px] text-ds-text-2">
        {status.hasFolder ? (
          <>
            <FolderOpen className="h-4 w-4 text-status-ok-fg" />
            <span>Carpeta creada en Google Drive</span>
            {status.fileCount > 0 && (
              <span className="text-[12px] text-ds-text-4">({status.fileCount} doc.)</span>
            )}
          </>
        ) : (
          <span className="text-ds-text-3">Sin carpeta en Google Drive</span>
        )}
      </div>
      {status.hasFolder && status.folderUrl ? (
        <Button variant="outline" size="sm" className="h-10 sm:h-9" asChild>
          <a href={status.folderUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Abrir en Drive
          </a>
        </Button>
      ) : (
        <Button
          size="sm"
          className="h-10 sm:h-9"
          disabled={working}
          onClick={() => void handleCreate()}
        >
          {working ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Creando carpeta y subiendo documentos…
            </>
          ) : (
            "Crear carpeta en Drive"
          )}
        </Button>
      )}
    </Surface>
  );
}
