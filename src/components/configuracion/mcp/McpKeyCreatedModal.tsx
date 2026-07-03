"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CopyField } from "./CopyField";
import { McpConnectSnippets } from "./McpConnectSnippets";

export function McpKeyCreatedModal({
  plainKey,
  baseUrl,
  onClose,
}: {
  plainKey: string | null;
  baseUrl: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(plainKey)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>API key creada</DialogTitle>
          <DialogDescription>
            Guárdala ahora: por seguridad no se volverá a mostrar.
          </DialogDescription>
        </DialogHeader>

        {plainKey && (
          <div className="space-y-4">
            <CopyField value={plainKey} label="Tu API key" />
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              Esta es la única vez que verás la key completa. Si la pierdes, revócala y crea otra.
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Conectar</p>
              <McpConnectSnippets apiKey={plainKey} baseUrl={baseUrl} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
