"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface MoveConflictInfo {
  itemName: string;
  targetDateLabel: string;
  suggestedFreeDateLabel: string;
  reason: "same_level" | "target_is_stronger";
}

interface MoveConflictDialogProps {
  open: boolean;
  conflict: MoveConflictInfo | null;
  onResolve: (strategy: "replace" | "next_free") => void;
  onCancel: () => void;
  busy?: boolean;
}

/**
 * Resolución de colisión al mover una cuota. Compartido por el popover de celda
 * y el drag de la grilla v2: ambos reciben el mismo 409 del backend.
 *
 *  - same_level: dos cuotas equivalentes (típico: dos proyecciones) → el
 *    usuario elige pisar la otra o correr la propia a la fecha libre.
 *  - target_is_stronger: en el destino hay una factura o una cuota conciliada
 *    → no se ofrece pisar, solo se informa.
 */
export function MoveConflictDialog({
  open,
  conflict,
  onResolve,
  onCancel,
  busy = false,
}: MoveConflictDialogProps) {
  if (!open || !conflict) return null;

  if (conflict.reason === "target_is_stronger") {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 px-1">
          <AlertCircle className="h-5 w-5 text-status-warn-fg shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-ds-text-1">
              Esa fecha tiene una factura o cuota conciliada
            </p>
            <p className="text-[12px] text-ds-text-3 mt-0.5">
              No se puede mover {conflict.itemName} al{" "}
              {conflict.targetDateLabel} sin desconciliar primero.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={onCancel}
          className="w-full h-11 sm:h-10 text-[13px]"
        >
          Entendido
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 px-1">
        <AlertCircle className="h-5 w-5 text-status-warn-fg shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-ds-text-1">
            Hay otra cuota en {conflict.targetDateLabel}
          </p>
          <p className="text-[12px] text-ds-text-3 mt-0.5">
            ¿Cómo querés resolver el conflicto?
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <Button
          variant="outline"
          onClick={() => onResolve("replace")}
          disabled={busy}
          className="w-full h-11 sm:h-10 text-[13px] justify-start"
        >
          Reemplazar la otra cuota
        </Button>
        <Button
          variant="outline"
          onClick={() => onResolve("next_free")}
          disabled={busy}
          className="w-full h-11 sm:h-10 text-[13px] justify-start"
        >
          Mover a {conflict.suggestedFreeDateLabel}
        </Button>
        <Button
          variant="ghost"
          onClick={onCancel}
          disabled={busy}
          className="w-full h-11 sm:h-10 text-[13px]"
        >
          Cancelar
        </Button>
      </div>
      {busy && (
        <div className="flex items-center justify-center gap-2 text-[13px] text-ds-text-3">
          <Loader2 className="h-4 w-4 animate-spin" /> Aplicando…
        </div>
      )}
    </div>
  );
}
