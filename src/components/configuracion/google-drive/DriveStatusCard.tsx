"use client";

import { ExternalLink, HardDrive } from "lucide-react";
import { Surface, Tag, Stat, StatGrid } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";

type Props = {
  connected: boolean;
  driveName: string;
  mode: "OAUTH" | "SHARED_DRIVE";
  totalInDrive: number;
  inFlight: number;
  pendingTotal: number;
  lastSyncAt: string | null;
  rootFolderUrl: string | null;
};

export function DriveStatusCard({
  connected,
  driveName,
  mode,
  totalInDrive,
  inFlight,
  pendingTotal,
  lastSyncAt,
  rootFolderUrl,
}: Props) {
  return (
    <Surface elevation={1} padding="md" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
            <HardDrive className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-base font-semibold text-ds-text-1">
              {connected ? driveName : "Google Drive"}
            </p>
            <p className="text-[13px] text-ds-text-3">
              {connected
                ? mode === "SHARED_DRIVE"
                  ? "Unidad compartida"
                  : "Carpeta espejo"
                : "Espejo documental por módulo"}
            </p>
          </div>
        </div>
        <Tag variant={connected ? "ok" : "neutral"} size="sm">
          {connected ? "Activo" : "Sin conectar"}
        </Tag>
      </div>

      {!connected ? (
        <Button asChild className="h-10 sm:h-9">
          <a href="/api/integrations/google-drive/oauth/start">
            <HardDrive className="mr-1.5 h-4 w-4" /> Conectar Drive
          </a>
        </Button>
      ) : (
        <>
          <StatGrid cols={1} lgCols={3}>
            <Stat label="En Drive" value={totalInDrive} animate />
            <Stat label="Subiendo" value={inFlight} animate />
            <Stat label="Sin subir" value={pendingTotal} animate />
          </StatGrid>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-ds-text-3">
              Última sincronización:{" "}
              {lastSyncAt
                ? new Date(lastSyncAt).toLocaleString("es-CL")
                : "—"}
            </p>
            {rootFolderUrl && (
              <Button variant="outline" size="sm" className="h-10 sm:h-9" asChild>
                <a href={rootFolderUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  Abrir en Drive
                </a>
              </Button>
            )}
          </div>
        </>
      )}
    </Surface>
  );
}
