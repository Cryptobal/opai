"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type DeleteDialogState = {
  open: boolean;
  type: "section" | "item";
  sectionId: string;
  itemId?: string;
  label: string;
};

type Props = {
  state: DeleteDialogState | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function ProtocolDeleteDialog({ state, onOpenChange, onConfirm }: Props) {
  return (
    <Dialog open={!!state?.open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar eliminación</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          ¿Estás seguro de que deseas eliminar{" "}
          {state?.type === "section" ? "la sección" : "el ítem"}{" "}
          <span className="font-medium text-foreground">
            &quot;{state?.label}&quot;
          </span>
          ?
          {state?.type === "section" &&
            " Se eliminarán también todos sus ítems."}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>
            Eliminar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
