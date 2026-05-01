"use client";

import { Button } from "@/components/ui/button";
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

interface SheetMarcarAusenteProps {
  open: boolean;
  onClose: () => void;
  item: AsistenciaItem | null;
  isDesktop: boolean;
  isSaving: boolean;
  patchAsistencia: (id: string, body: Record<string, unknown>) => Promise<PatchResult>;
  onOpenBuscarReemplazo: (item: AsistenciaItem) => void;
}

export function SheetMarcarAusente({
  open,
  onClose,
  item,
  isDesktop,
  isSaving,
  patchAsistencia,
  onOpenBuscarReemplazo,
}: SheetMarcarAusenteProps) {
  if (!item) return null;

  const guardName = item.plannedGuardia
    ? formatPersonName(item.plannedGuardia.persona.firstName, item.plannedGuardia.persona.lastName)
    : "el guardia";

  const handleAbsentOnly = async () => {
    const result = await patchAsistencia(item.id, {
      attendanceStatus: "no_asistio",
      actualGuardiaId: null,
    });
    if (result.ok) {
      toast.success("No asistió");
      onClose();
    } else if (result.code === "CONTRADICCION_MARCACION_ELECTRONICA") {
      // The caller will handle contradiction via the returned result
      onClose();
    }
    return result;
  };

  const handleAbsentAndSearch = async () => {
    const result = await patchAsistencia(item.id, {
      attendanceStatus: "no_asistio",
      actualGuardiaId: null,
    });
    if (result.ok) {
      toast.success("No asistió");
      onClose();
      // Open the replacement search for the updated item
      onOpenBuscarReemplazo({ ...item, attendanceStatus: "no_asistio" });
    } else if (result.code === "CONTRADICCION_MARCACION_ELECTRONICA") {
      onClose();
    }
    return result;
  };

  const content = (
    <div className="space-y-4 py-2">
      <div className="rounded-md border border-status-warn-border bg-status-warn-soft p-3 text-sm">
        <p>
          ¿<strong>{guardName}</strong> no se presentó?
        </p>
        <p className="text-muted-foreground text-xs mt-1">Se marcará como ausente.</p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          disabled={isSaving}
          onClick={handleAbsentOnly}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Solo ausente"}
        </Button>
        <Button
          className="flex-1"
          disabled={isSaving}
          onClick={handleAbsentAndSearch}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ausente + Buscar reemplazo"}
        </Button>
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar ausente</DialogTitle>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="max-h-[80vh] rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Marcar ausente</SheetTitle>
        </SheetHeader>
        <div className="mt-4">{content}</div>
      </SheetContent>
    </Sheet>
  );
}
