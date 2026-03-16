"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import type { AsistenciaItem } from "@/types/ops-asistencia";
import type { PatchResult } from "@/hooks/useAsistenciaDiaria";
import { toast } from "sonner";

function dateFromISO(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function buildIsoFromDateAndTime(isoDate: string, hhmm: string): string {
  const day = dateFromISO(isoDate);
  return `${day}T${hhmm}:00.000Z`;
}

function timeFromISO(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

interface ModalMarcarAsistenciaProps {
  item: AsistenciaItem | null;
  open: boolean;
  onClose: () => void;
  isSaving: boolean;
  patchAsistencia: (id: string, body: Record<string, unknown>) => Promise<PatchResult>;
}

export function ModalMarcarAsistencia({
  item,
  open,
  onClose,
  isSaving,
  patchAsistencia,
}: ModalMarcarAsistenciaProps) {
  const [hours, setHours] = useState<{ checkIn: string; checkOut: string }>({ checkIn: "", checkOut: "" });

  // Sync defaults when item changes
  const syncDefaults = (i: AsistenciaItem) => {
    setHours({
      checkIn: timeFromISO(i.checkInAt) || i.puesto.shiftStart,
      checkOut: timeFromISO(i.checkOutAt) || i.puesto.shiftEnd,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
        else if (item) syncDefaults(item);
      }}
    >
      <DialogContent className="sm:max-w-md" onOpenAutoFocus={() => { if (item) syncDefaults(item); }}>
        <DialogHeader>
          <DialogTitle>Marcar asistencia</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Ingresa la hora de entrada y salida real.
          </p>
        </DialogHeader>
        {item && (
          <div className="space-y-4 py-2">
            <div className="rounded-md border border-border/60 bg-muted/20 p-2.5 text-sm">
              <span className="font-medium">{item.puesto.name}</span>
              <span className="text-muted-foreground ml-2">
                S{item.slotNumber} · Plan: {item.puesto.shiftStart}-{item.puesto.shiftEnd}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Entrada real</Label>
                <Input
                  type="time"
                  step="300"
                  value={hours.checkIn}
                  onChange={(e) => setHours((p) => ({ ...p, checkIn: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label>Salida real</Label>
                <Input
                  type="time"
                  step="300"
                  value={hours.checkOut}
                  onChange={(e) => setHours((p) => ({ ...p, checkOut: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setHours({
                    checkIn: item.puesto.shiftStart,
                    checkOut: item.puesto.shiftEnd,
                  })
                }
              >
                Usar plan
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setHours((p) => ({
                    ...p,
                    checkOut: (() => {
                      const [hh, mm] = (p.checkOut || "19:00").split(":").map(Number);
                      let total = (hh * 60 + mm + 60) % (24 * 60);
                      if (total < 0) total += 24 * 60;
                      return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
                    })(),
                  }))
                }
              >
                +1h salida
              </Button>
              <Button
                size="sm"
                disabled={isSaving}
                onClick={async () => {
                  const isReemplazo = item.attendanceStatus === "reemplazo";
                  const payload: Record<string, unknown> = {
                    checkInAt: buildIsoFromDateAndTime(item.date, hours.checkIn),
                    checkOutAt: buildIsoFromDateAndTime(item.date, hours.checkOut),
                  };
                  if (!isReemplazo) {
                    payload.attendanceStatus = "asistio";
                    payload.actualGuardiaId = item.actualGuardiaId ?? item.plannedGuardiaId ?? null;
                  }
                  const result = await patchAsistencia(item.id, payload);
                  if (result.ok) {
                    toast.success(isReemplazo ? "Horas del reemplazo guardadas" : "Asistencia marcada con horas");
                    onClose();
                  }
                }}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar asistencia"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
