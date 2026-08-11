"use client";

import { useState } from "react";
import { Copy, Loader2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  mode: "OAUTH" | "SHARED_DRIVE";
  sharedDriveId: string | null;
  sharedDriveName: string | null;
  serviceAccountEmail: string | null;
  googleEmail: string | null;
  structureVersion: number;
  repairing: boolean;
  onRepair: () => void;
  onChangeUnit: (sharedDriveId: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
};

export function DriveAdvancedPanel(props: Props) {
  const {
    mode, sharedDriveId, sharedDriveName, serviceAccountEmail, googleEmail,
    structureVersion, repairing, onRepair, onChangeUnit, onDisconnect,
  } = props;
  const [driveId, setDriveId] = useState(sharedDriveId ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isShared = mode === "SHARED_DRIVE";

  async function changeUnit() {
    setBusy(true);
    setError(null);
    try {
      await onChangeUnit(driveId.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la unidad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-xl border border-ds-border-subtle bg-ds-surface-1">
      <summary className="cursor-pointer list-none px-4 py-3 font-display text-[13px] font-semibold text-ds-text-1 marker:content-none [&::-webkit-details-marker]:hidden">
        Avanzado
        <span className="ml-2 font-sans text-[12px] font-normal text-ds-text-4">
          unidad, estructura, desconexión
        </span>
      </summary>
      <div className="space-y-4 border-t border-ds-border-subtle px-4 py-4">
        <dl className="space-y-2 text-[13px]">
          <div>
            <dt className="text-ds-text-4">Unidad</dt>
            <dd className="text-ds-text-2">{sharedDriveName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-ds-text-4">Identificador</dt>
            <dd className="flex items-start gap-2 break-all font-mono text-[12px] text-ds-text-2">
              <span className="min-w-0">{sharedDriveId ?? "—"}</span>
              {sharedDriveId && (
                <button
                  type="button"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center sm:h-9 sm:w-9"
                  onClick={() => void navigator.clipboard.writeText(sharedDriveId)}
                  aria-label="Copiar identificador"
                >
                  <Copy className="h-4 w-4 text-ds-text-3" />
                </button>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-ds-text-4">Cuenta que escribe</dt>
            <dd className="break-all text-ds-text-2">
              {isShared ? serviceAccountEmail ?? "Cuenta de servicio" : googleEmail ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-ds-text-4">Versión de estructura</dt>
            <dd className="text-ds-text-2">v{structureVersion}</dd>
          </div>
        </dl>

        <Button variant="outline" size="sm" className="h-10 sm:h-9" disabled={repairing || busy} onClick={onRepair}>
          {repairing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wrench className="mr-1.5 h-4 w-4" />}
          Revisar estructura
        </Button>

        <div className="space-y-2">
          <p className="text-[13px] font-medium text-ds-text-2">Cambiar unidad</p>
          <Input
            className="h-10 break-all font-mono text-[12px] sm:h-9"
            placeholder="ID de la Unidad Compartida"
            value={driveId}
            onChange={(e) => setDriveId(e.target.value)}
          />
          <Button className="h-10 sm:h-9" disabled={busy || driveId.trim().length < 10} onClick={() => void changeUnit()}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Verificar y activar
          </Button>
        </div>

        {error && <p className="text-[13px] text-status-danger-fg">{error}</p>}

        {!isShared && (
          <div className="space-y-2 rounded-xl border border-status-danger-border bg-status-danger-soft p-3">
            <p className="text-[13px] font-medium text-status-danger-fg">Desconectar</p>
            <p className="text-[13px] text-ds-text-2">
              Revoca el acceso OAuth, borra la caché de carpetas y resetea la estructura.
              Los archivos en Drive no se eliminan.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-10 border-status-danger-border text-status-danger-fg sm:h-9"
              onClick={() => setConfirmOpen(true)}
            >
              Desconectar
            </Button>
          </div>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>¿Desconectar Google Drive?</DialogTitle>
            <DialogDescription>
              Se revoca el token OAuth, se borra la caché de carpetas y la estructura
              vuelve a v1. Los archivos ya subidos a Drive se conservan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => { setConfirmOpen(false); void onDisconnect(); }}>
              Sí, desconectar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </details>
  );
}
