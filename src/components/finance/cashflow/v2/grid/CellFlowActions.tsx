"use client";

import { useState } from "react";
import { EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  hideFromFlowViaApi,
  type HideInput,
} from "./cashflow-hide";

export type HideUndoPayload = {
  label: string;
  dteId: string | null;
  occurrenceId: string | null;
};

interface Props {
  target: HideInput;
  /** Semana cerrada, pagada o sin permisos. */
  disabled?: boolean;
  onHidden: (undo: HideUndoPayload) => void;
  children: React.ReactNode;
}

/**
 * Envuelve el chip de la celda y agrega un botón "ocultar" (hover en desktop,
 * siempre visible en touch) que abre confirmación. No pelea con el drag del
 * chip: el trigger es un botón aparte.
 */
export function CellFlowActions({
  target,
  disabled,
  onHidden,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const itemIdOk =
    !!target.itemId &&
    !target.itemId.startsWith("_dte:") &&
    !target.itemId.startsWith("_orphan") &&
    !target.itemId.startsWith("_periodic") &&
    !target.itemId.startsWith("_extra:") &&
    !target.itemId.startsWith("_conc:") &&
    !target.itemId.startsWith("_group:");

  const canHide =
    !disabled && (!!target.dteId || !!target.occurrenceId || itemIdOk);

  async function hide() {
    setBusy(true);
    const res = await hideFromFlowViaApi({
      ...target,
      itemId: itemIdOk ? target.itemId : null,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo ocultar");
      return;
    }
    setOpen(false);
    setConfirming(false);
    onHidden({
      label: target.label,
      dteId: target.dteId,
      occurrenceId: res.occurrenceId ?? target.occurrenceId,
    });
  }

  if (!canHide) return <>{children}</>;

  return (
    <span className="group/hide relative inline-flex">
      {children}
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setConfirming(false);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Ocultar del flujo"
            aria-label={`Ocultar ${target.label} del flujo`}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              "absolute -right-1.5 -top-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-ds-border-default bg-ds-surface-1 text-ds-text-3 shadow-ds-sm transition-opacity hover:bg-ds-surface-3 hover:text-status-danger-fg",
              // Desktop: aparece al hover del chip. Touch: siempre visible
              // (no hay hover fiable).
              "opacity-100 md:opacity-0 md:group-hover/hide:opacity-100",
              open && "opacity-100",
            )}
          >
            <EyeOff className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          side="bottom"
          // El Popover base fija max-w al ancho del trigger (el ojo ~24px);
          // sin override el texto se apila 1 letra por línea y tapa la grilla.
          className="w-64 min-w-64 max-w-64 space-y-2 p-3"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {!confirming ? (
            <>
              <p className="text-[12px] text-ds-text-3">
                {target.dteId
                  ? "No borra la factura. Solo deja de contarla en el flujo."
                  : "Oculta esta programación del flujo. No elimina el contrato."}
              </p>
              <Button
                variant="outline"
                className="h-10 w-full justify-start text-[13px] text-status-danger-fg hover:bg-status-danger-soft sm:h-9"
                onClick={() => setConfirming(true)}
              >
                <EyeOff className="mr-2 h-3.5 w-3.5" />
                Ocultar del flujo
              </Button>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-[13px] text-ds-text-1">
                ¿Ocultar «{target.label}» del flujo?
              </p>
              <p className="text-[12px] text-ds-text-3">
                {target.dteId
                  ? "La factura sigue en Facturación. Podés deshacer en unos segundos."
                  : "La cuota deja de proyectarse. Podés deshacer en unos segundos."}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-10 flex-1 text-[13px] sm:h-9"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  Cancelar
                </Button>
                <Button
                  className="h-10 flex-1 text-[13px] sm:h-9"
                  disabled={busy}
                  onClick={() => void hide()}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Ocultar"
                  )}
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </span>
  );
}
