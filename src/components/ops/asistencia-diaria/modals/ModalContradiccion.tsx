"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PatchResult } from "@/hooks/useAsistenciaDiaria";
import { toast } from "sonner";

interface ContradictionState {
  id: string;
  payload: Record<string, unknown>;
  message: string;
  successMessage?: string;
}

interface ModalContradiccionProps {
  state: ContradictionState | null;
  onClose: () => void;
  isSaving: boolean;
  patchAsistencia: (id: string, body: Record<string, unknown>) => Promise<PatchResult>;
}

export function ModalContradiccion({
  state,
  onClose,
  isSaving,
  patchAsistencia,
}: ModalContradiccionProps) {
  return (
    <Dialog open={!!state} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Contradicción con marcación electrónica</DialogTitle>
          <p className="text-sm text-muted-foreground">{state?.message}</p>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isSaving}
            onClick={async () => {
              if (!state) return;
              onClose();
              const result = await patchAsistencia(state.id, {
                ...state.payload,
                confirmarContradiccion: true,
              });
              if (result.ok && state.successMessage) {
                toast.success(state.successMessage);
              }
            }}
          >
            Sí, marcar como no asistió
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type { ContradictionState };
