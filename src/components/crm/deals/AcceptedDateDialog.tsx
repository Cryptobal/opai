"use client";

import { DatePickerField } from "@/components/ui/date-picker";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  date: string;
  onDateChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function AcceptedDateDialog({
  open,
  date,
  onDateChange,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Fecha de inicio del servicio</DialogTitle>
          <DialogDescription>
            Ingresa la fecha estimada de inicio del servicio para este negocio adjudicado.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="accepted-date">Fecha de inicio</Label>
          <DatePickerField value={date || null} onChange={(ymd) => onDateChange((ymd ?? ""))} id={"accepted-date"} triggerClassName={"mt-1.5 h-10 sm:h-9"} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={!date}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
