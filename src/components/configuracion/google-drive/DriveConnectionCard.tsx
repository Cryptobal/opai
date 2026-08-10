"use client";

import { useState } from "react";
import { ExternalLink, FolderTree, HardDrive, Loader2, Wrench } from "lucide-react";
import { Surface, Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type DuplicateRoot = { id: string; createdTime?: string | null };

type Props = {
  connected: boolean;
  googleEmail: string | null;
  rootFolderUrl: string | null;
  structureVersion: number;
  duplicateRoots: DuplicateRoot[];
  creatingStructure: boolean;
  repairing: boolean;
  onCreateStructure: () => void;
  onRepair: (consolidateRoots: boolean) => void;
  onDisconnect: () => void;
};

const DISCONNECTED_COPY =
  "Espejo documental por módulo: Comercial, Personas y Operaciones";

export function DriveConnectionCard({
  connected,
  googleEmail,
  rootFolderUrl,
  structureVersion,
  duplicateRoots,
  creatingStructure,
  repairing,
  onCreateStructure,
  onRepair,
  onDisconnect,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const hasDupes = duplicateRoots.length > 0;

  return (
    <Surface elevation={1} padding="md" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-base font-semibold text-ds-text-1">Google Drive</p>
            <p className="text-[13px] text-ds-text-3">
              {connected ? googleEmail : DISCONNECTED_COPY}
            </p>
            {connected && (
              <p className="text-[12px] text-ds-text-4">
                Estructura v{structureVersion}
                {hasDupes ? ` · ${duplicateRoots.length + 1} raíces detectadas` : ""}
              </p>
            )}
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
            {rootFolderUrl && (
              <Button variant="outline" size="sm" className="h-10 sm:h-9" asChild>
                <a href={rootFolderUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  Abrir en Drive
                </a>
              </Button>
            )}
            <Button
              size="sm"
              className="h-10 sm:h-9"
              onClick={onCreateStructure}
              disabled={creatingStructure || repairing}
            >
              {creatingStructure ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <FolderTree className="mr-1.5 h-4 w-4" />
              )}
              Crear estructura
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-10 sm:h-9"
              disabled={creatingStructure || repairing}
              onClick={() => {
                if (hasDupes) setConfirmOpen(true);
                else onRepair(false);
              }}
            >
              {repairing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Wrench className="mr-1.5 h-4 w-4" />
              )}
              Reparar estructura
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-10 sm:h-9"
              onClick={onDisconnect}
              disabled={repairing}
            >
              Desconectar
            </Button>
          </>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Consolidar raíces duplicadas</DialogTitle>
            <DialogDescription>
              Se moverán los contenidos visibles a la carpeta canónica. Las raíces
              que queden vacías se enviarán a la papelera de Drive (reversible 30 días).
              Las que tengan hijos no visibles para OPAI no se tocarán.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-ds-border-subtle bg-ds-surface-1 p-2 text-[13px] text-ds-text-2">
            {duplicateRoots.map((r) => (
              <li key={r.id} className="font-mono text-[12px]">
                {r.id}
                {r.createdTime ? ` · ${new Date(r.createdTime).toLocaleDateString("es-CL")}` : ""}
              </li>
            ))}
          </ul>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                onRepair(true);
              }}
            >
              Confirmar y reparar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Surface>
  );
}
