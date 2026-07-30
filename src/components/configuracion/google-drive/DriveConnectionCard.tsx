"use client";

import { HardDrive, FolderTree, Loader2 } from "lucide-react";
import { Surface, Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";

type Props = {
  connected: boolean;
  googleEmail: string | null;
  creatingStructure: boolean;
  onCreateStructure: () => void;
  onDisconnect: () => void;
};

const DISCONNECTED_COPY =
  "Espejo documental: cotizaciones, facturas, licitaciones, negocios y personas";

export function DriveConnectionCard({
  connected,
  googleEmail,
  creatingStructure,
  onCreateStructure,
  onDisconnect,
}: Props) {
  return (
    <Surface elevation={1} padding="md" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-base font-semibold text-ds-text-1">Google Drive</p>
            <p className="text-ds-body text-ds-text-3">
              {connected ? googleEmail : DISCONNECTED_COPY}
            </p>
          </div>
        </div>
        <Tag variant={connected ? "ok" : "neutral"} size="sm">
          {connected ? "Conectado" : "Sin conectar"}
        </Tag>
      </div>
      <div className="flex flex-wrap gap-2">
        {!connected ? (
          <Button asChild>
            <a href="/api/integrations/google-drive/oauth/start">
              <HardDrive className="mr-1.5 h-4 w-4" /> Conectar Drive
            </a>
          </Button>
        ) : (
          <>
            <Button size="sm" onClick={onCreateStructure} disabled={creatingStructure}>
              {creatingStructure ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <FolderTree className="mr-1.5 h-4 w-4" />
              )}
              Crear estructura ahora
            </Button>
            <Button variant="outline" size="sm" onClick={onDisconnect}>
              Desconectar
            </Button>
          </>
        )}
      </div>
    </Surface>
  );
}
