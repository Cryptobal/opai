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
import { fmtCLP, toDate } from "./format";

interface Props {
  open: boolean;
  weekEndDate: string | Date | null;
  balanceClp: number | null;
  submitting?: boolean;
  onCancel: () => void;
  onReopen: () => void;
}

/**
 * Aviso al intentar mover algo desde una semana cerrada/anclada. Reabrir quita
 * el anchor (reusa POST weekly-close con anchor:false) y recalcula la
 * proyección hacia adelante.
 */
export function ClosedWeekModal({
  open,
  weekEndDate,
  balanceClp,
  submitting,
  onCancel,
  onReopen,
}: Props) {
  const fecha = weekEndDate
    ? toDate(weekEndDate).toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "short",
      })
    : "—";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Semana cerrada</DialogTitle>
          <DialogDescription className="leading-relaxed">
            Semana cerrada y cuadrada al {fecha}
            {balanceClp != null ? `, saldo ${fmtCLP.format(balanceClp)}` : ""}.
            Mover esto la reabre y recalcula la proyección. ¿Reabrir?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={onReopen} disabled={submitting}>
            Reabrir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
