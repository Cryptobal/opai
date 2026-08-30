"use client";

import { useEffect, useState } from "react";
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
import type { AsistenciaItem } from "@/types/ops-asistencia";
import type { PatchResult } from "@/hooks/useAsistenciaDiaria";
import { toast } from "sonner";

function timeFromISO(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function dateFromISO(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function buildIsoFromDateAndTime(isoDate: string, hhmm: string): string {
  const day = dateFromISO(isoDate);
  return `${day}T${hhmm}:00.000Z`;
}

function nowHhmmUtc(): string {
  const d = new Date();
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

interface SheetRetiroAnticipadoProps {
  open: boolean;
  onClose: () => void;
  item: AsistenciaItem | null;
  isDesktop: boolean;
  isSaving: boolean;
  /** Si true, solo pide cobertura (ya hay earlyDepartureAt). */
  coverOnly?: boolean;
  retiroAnticipado: (
    id: string,
    payload: {
      checkOutAt: string;
      reason: string;
      cobertura?: {
        guardiaId: string;
        amountClp?: number;
        amountJustification?: string;
      };
    }
  ) => Promise<PatchResult>;
  /** Cuando el usuario activa "cubrir ahora": cierra sheet y abre buscar guardia. */
  onRequestCover: (item: AsistenciaItem, pending: { checkOutAt: string; reason: string }) => void;
}

export function SheetRetiroAnticipado({
  open,
  onClose,
  item,
  isDesktop,
  isSaving,
  coverOnly = false,
  retiroAnticipado,
  onRequestCover,
}: SheetRetiroAnticipadoProps) {
  const [checkOutHhmm, setCheckOutHhmm] = useState("");
  const [reason, setReason] = useState("");
  const [coverNow, setCoverNow] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    setCheckOutHhmm(timeFromISO(item.checkOutAt) || nowHhmmUtc());
    setReason(item.earlyDepartureReason ?? "");
    setCoverNow(coverOnly);
  }, [open, item, coverOnly]);

  if (!item) return null;

  const guardName = item.plannedGuardia
    ? formatPersonName(
        item.plannedGuardia.persona.firstName,
        item.plannedGuardia.persona.lastName
      )
    : "el guardia";

  const canSubmit =
    !isSaving &&
    checkOutHhmm.length === 5 &&
    (coverOnly || reason.trim().length >= 3);

  const handleConfirm = async () => {
    if (!canSubmit) return;
    const checkOutAt = buildIsoFromDateAndTime(item.date, checkOutHhmm);
    const reasonText = reason.trim() || item.earlyDepartureReason || "Retiro anticipado";

    if (coverNow || coverOnly) {
      onRequestCover(item, { checkOutAt, reason: reasonText });
      onClose();
      return;
    }

    const result = await retiroAnticipado(item.id, {
      checkOutAt,
      reason: reasonText,
    });
    if (result.ok) {
      toast.success("Retiro anticipado registrado");
      onClose();
    }
  };

  const content = (
    <div className="space-y-4 py-2">
      <div className="rounded-md border border-status-warn-border bg-status-warn-soft p-3 text-sm">
        <p className="font-medium text-status-warn-fg">Retiro anticipado</p>
        <p className="text-ds-text-2 mt-1 text-[13px]">
          {guardName} se retira antes del fin de turno. Se conservan sus horas
          parciales; el resto queda por cubrir.
        </p>
      </div>

      {!coverOnly && (
        <>
          <div className="space-y-2">
            <Label htmlFor="retiro-checkout">Hora efectiva de salida</Label>
            <Input
              id="retiro-checkout"
              type="time"
              value={checkOutHhmm}
              onChange={(e) => setCheckOutHhmm(e.target.value)}
              className="h-11 sm:h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="retiro-reason">Motivo</Label>
            <Input
              id="retiro-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. malestar, emergencia familiar…"
              className="h-11 sm:h-10"
              maxLength={500}
            />
          </div>
          <label className="flex items-center gap-3 min-h-11 cursor-pointer">
            <input
              type="checkbox"
              checked={coverNow}
              onChange={(e) => setCoverNow(e.target.checked)}
              className="h-5 w-5 rounded border-ds-border-default"
            />
            <span className="text-sm">Cubrir horas restantes ahora</span>
          </label>
        </>
      )}

      {coverOnly && (
        <p className="text-sm text-ds-text-2">
          Se abrirá la búsqueda de guardia para cubrir el resto del turno (
          {timeFromISO(item.checkOutAt) || checkOutHhmm}–
          {item.plannedShiftEnd ?? item.puesto.shiftEnd}).
        </p>
      )}

      <div className="flex flex-col gap-2 pt-1">
        <Button
          className="h-11 sm:h-10 w-full"
          disabled={!canSubmit}
          onClick={() => void handleConfirm()}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : coverNow || coverOnly ? (
            "Continuar a cobertura"
          ) : (
            "Confirmar retiro"
          )}
        </Button>
        <Button
          variant="ghost"
          className="h-11 sm:h-10 w-full"
          disabled={isSaving}
          onClick={onClose}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Se retiró antes</DialogTitle>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl pb-[max(env(safe-area-inset-bottom),1.5rem)]"
      >
        <SheetHeader>
          <SheetTitle>Se retiró antes</SheetTitle>
        </SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  );
}
