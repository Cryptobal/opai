"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (queued: number) => void;
  onError: (message: string) => void;
};

export function SharedDriveReexportDialog({
  open,
  onOpenChange,
  onDone,
  onError,
}: Props) {
  const [reexporting, setReexporting] = useState(false);

  async function reexportAll() {
    setReexporting(true);
    try {
      let cursor: string | null = null;
      let total = 0;
      do {
        const res: Response = await fetch("/api/integrations/google-drive/reexport", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true, cursor }),
        });
        const json: { error?: string; queued?: number; remaining?: boolean; nextCursor?: string | null } =
          await res.json();
        if (!res.ok) throw new Error(json.error || "Re-export falló");
        total += json.queued ?? 0;
        cursor = json.remaining ? (json.nextCursor ?? null) : null;
      } while (cursor);
      onOpenChange(false);
      onDone(total);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Error");
    } finally {
      setReexporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Re-exportar todo a la Unidad Compartida</DialogTitle>
          <DialogDescription>
            Encola desde R2 los documentos CRM vigentes (hasta 500 por lote).
            Puede saturar la outbox; no ejecutes en paralelo con otras cargas
            masivas.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={reexporting} onClick={() => void reexportAll()}>
            {reexporting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : null}
            Confirmar re-exportación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
