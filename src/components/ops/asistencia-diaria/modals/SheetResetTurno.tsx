"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { formatPersonName } from "@/lib/personas";
import type { AsistenciaItem, TurnoExtraItem } from "@/types/ops-asistencia";
import { getActiveTe, getInitialStatus } from "@/types/ops-asistencia";
import type { PatchResult } from "@/hooks/useAsistenciaDiaria";
import { toast } from "sonner";

interface SheetResetTurnoProps {
  open: boolean;
  onClose: () => void;
  item: AsistenciaItem | null;
  isDesktop: boolean;
  canManagePaidTeReset: boolean;
  isSaving: boolean;
  patchAsistencia: (id: string, body: Record<string, unknown>) => Promise<PatchResult>;
}

export function SheetResetTurno({
  open,
  onClose,
  item,
  isDesktop,
  canManagePaidTeReset,
  isSaving,
  patchAsistencia,
}: SheetResetTurnoProps) {
  const [reason, setReason] = useState("");

  if (!item) return null;

  const te = getActiveTe(item);
  const initialStatus = getInitialStatus(item);
  const isPaidTe = te?.status === "paid";
  const isPendingOrApproved = te && (te.status === "pending" || te.status === "approved");

  const guardName = item.replacementGuardia
    ? formatPersonName(item.replacementGuardia.persona.firstName, item.replacementGuardia.persona.lastName)
    : "guardia";

  const handleReset = async () => {
    const payload: Record<string, unknown> = {
      attendanceStatus: initialStatus,
      actualGuardiaId: null,
      replacementGuardiaId: null,
    };
    if (isPaidTe && canManagePaidTeReset) {
      payload.forceDeletePaidTe = true;
      payload.forceDeleteReason = reason.trim();
    }
    const result = await patchAsistencia(item.id, payload);
    if (result.ok) {
      toast.success(isPaidTe ? "Estado reseteado (override admin)" : "Estado reseteado");
      onClose();
    }
  };

  const content = (
    <div className="space-y-4 py-2">
      {/* No TE */}
      {!te && (
        <p className="text-sm text-muted-foreground">
          ¿Resetear este turno? Volverá a <strong>{initialStatus === "ppc" ? "PPC" : "Pendiente"}</strong>.
        </p>
      )}

      {/* Pending/Approved TE */}
      {isPendingOrApproved && (
        <div className="rounded-md border border-status-warn-border bg-status-warn-soft p-3 text-sm">
          <p>
            Se eliminará el TE de <strong>{guardName}</strong> (${Number(te.amountClp).toLocaleString("es-CL")})
          </p>
          <p className="text-xs text-muted-foreground mt-1">Estado actual: {te.status}</p>
        </div>
      )}

      {/* Paid TE — non-admin */}
      {isPaidTe && !canManagePaidTeReset && (
        <div className="rounded-md border border-status-danger-border bg-status-danger-soft p-3 text-sm text-status-danger-fg">
          <p className="font-medium">No se puede resetear: TE pagado.</p>
          <p className="text-xs mt-1">Solicita override a un admin.</p>
        </div>
      )}

      {/* Paid TE — admin */}
      {isPaidTe && canManagePaidTeReset && (
        <div className="space-y-3">
          <div className="rounded-md border border-status-danger-border bg-status-danger-soft p-3 text-sm text-status-danger-fg">
            <p className="font-medium">PELIGRO: TE PAGADO</p>
            <p className="text-xs mt-1">
              TE de {guardName} (${Number(te.amountClp).toLocaleString("es-CL")}) — estado: pagado.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Motivo para eliminar TE pagado (obligatorio)</Label>
            <Input
              placeholder="Ingresa el motivo…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-10"
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        {!(isPaidTe && !canManagePaidTeReset) && (
          <Button
            variant="destructive"
            size="sm"
            disabled={isSaving || (isPaidTe && canManagePaidTeReset && reason.trim().length === 0)}
            onClick={handleReset}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Resetear"}
          </Button>
        )}
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resetear turno</DialogTitle>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { onClose(); setReason(""); } }}>
      <SheetContent side="bottom" className="max-h-[80vh] rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Resetear turno</SheetTitle>
        </SheetHeader>
        <div className="mt-4">{content}</div>
      </SheetContent>
    </Sheet>
  );
}
