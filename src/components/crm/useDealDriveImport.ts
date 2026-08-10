"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

// Throttle en memoria de módulo para el auto-pull al montar el tab
// Documentos: 1 import por deal cada 5 min.
const lastImportAt = new Map<string, number>();
const THROTTLE_MS = 5 * 60_000;

export function shouldAutoImport(dealId: string): boolean {
  const last = lastImportAt.get(dealId) ?? 0;
  if (Date.now() - last < THROTTLE_MS) return false;
  lastImportAt.set(dealId, Date.now());
  return true;
}

/** POST { action: "import" } → trae documentos nuevos de la carpeta Drive del deal. */
export function useDealDriveImport(dealId: string, onImported?: () => void) {
  const [importing, setImporting] = useState(false);

  const runImport = useCallback(
    async (silent: boolean) => {
      setImporting(true);
      try {
        const res = await fetch(`/api/crm/deals/${dealId}/drive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "import" }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "No se pudo importar");
        const imported = Number(json.data?.imported) || 0;
        const reason = json.data?.reason as string | undefined;
        if (!silent) {
          if (imported > 0) {
            toast.success(`${imported} documento(s) traído(s) desde Drive`);
          } else if (reason === "scope_limitado") {
            toast.message(
              "Los archivos subidos directamente en Drive no son visibles para OPAI con el permiso actual. Usá el selector de Drive o subilos desde OPAI.",
            );
          } else if (reason === "sin_carpeta") {
            toast.message("Todavía no hay carpeta de este negocio en Drive");
          } else {
            toast.success("Sin documentos nuevos elegibles en Drive");
          }
        }
        if (imported > 0) onImported?.();
      } catch (err) {
        if (!silent) {
          toast.error(err instanceof Error ? err.message : "Error al importar desde Drive");
        }
      } finally {
        setImporting(false);
      }
    },
    [dealId, onImported],
  );

  return { importing, runImport };
}
