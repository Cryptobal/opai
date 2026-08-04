"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FooterState } from "./types";

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

export interface ReconcileFooterProps {
  state: FooterState;
  saving?: boolean;
  amountAbs?: number;
  remaining?: number;
  overflow?: number;
  modeLabel?: "create" | "edit";
  onPrimary: () => void;
  onCancel: () => void;
  onOpenDetail?: () => void;
}

export function ReconcileFooter({
  state,
  saving = false,
  amountAbs = 0,
  remaining = 0,
  overflow = 0,
  modeLabel = "create",
  onPrimary,
  onCancel,
  onOpenDetail,
}: ReconcileFooterProps) {
  const primaryDisabled = state === "empty" || saving;
  const primaryIsWarn = state === "diff";

  let primaryText = "Seleccioná facturas";
  if (state === "ready") {
    primaryText =
      modeLabel === "edit"
        ? "Guardar cambios"
        : `Conciliar ${fmtCLP.format(amountAbs)}`;
  } else if (state === "diff") {
    const gap = overflow > 1 ? overflow : remaining;
    primaryText = `Resolver ${fmtCLP.format(gap)}`;
  }

  return (
    <div
      className={cn(
        "shrink-0 flex items-center gap-2 border-t border-ds-border-default",
        "bg-background px-4 sm:px-6",
        "h-[72px]",
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <Button
        type="button"
        variant="outline"
        className="h-11 sm:h-10 shrink-0"
        onClick={onCancel}
        disabled={saving}
      >
        {modeLabel === "edit" ? "Cancelar edición" : "Cancelar"}
      </Button>
      <Button
        type="button"
        className={cn(
          "h-11 sm:h-10 flex-1 min-w-0",
          primaryIsWarn &&
            "bg-status-warn text-white hover:bg-status-warn/90",
        )}
        disabled={primaryDisabled}
        onClick={() => {
          if (state === "diff" && onOpenDetail) {
            onOpenDetail();
            return;
          }
          onPrimary();
        }}
      >
        {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
        {primaryText}
      </Button>
    </div>
  );
}
