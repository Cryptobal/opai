"use client";
import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { WeekCloseStep1BankBalance } from "./WeekCloseStep1BankBalance";
import { WeekCloseStep2Breakdown } from "./WeekCloseStep2Breakdown";
import { WeekCloseStep3Anchor } from "./WeekCloseStep3Anchor";
import type { WeeklyCloseSnapshotDTO, VarianceResolution } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCommitted: () => void;
  weekEndIso: string;
}

/**
 * Drawer único para cerrar la semana del flujo de caja:
 *   Paso 1: confirmar saldo banco real (reusa /bank-balance/adjust)
 *   Paso 2: desglose por línea con acciones (conciliar / recurrente /
 *           puntual / ajuste para bank txs; mover / pagar / cancelar
 *           para cuotas no cumplidas)
 *   Paso 3: anclar proyección al saldo banco real + resolución de varianza
 *
 * Reemplaza al lápiz pequeño del BankBalanceAdjustDrawer como acción
 * primaria sobre la celda de saldo banco del bucket actual.
 */
export function WeekCloseDrawer({
  open,
  onClose,
  onCommitted,
  weekEndIso,
}: Props) {
  const [snap, setSnap] = useState<WeeklyCloseSnapshotDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [anchor, setAnchor] = useState(true);
  const [varianceResolution, setVarianceResolution] =
    useState<VarianceResolution>("PENDING");

  async function refresh() {
    if (!weekEndIso) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/finance/cashflow/weekly-close/snapshot?weekEnd=${encodeURIComponent(weekEndIso)}`,
      );
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      setSnap(j.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error cargando snapshot");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, weekEndIso]);

  async function handleCommit() {
    if (!snap) return;
    setCommitting(true);
    try {
      const res = await fetch("/api/finance/cashflow/weekly-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekEnd: weekEndIso,
          anchor,
          varianceResolution,
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error);
      toast.success(anchor ? "Semana cerrada y anclada" : "Semana cerrada");
      onCommitted();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cerrar");
    } finally {
      setCommitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border/50">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" /> Cerrar semana
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
            </div>
          )}
          {snap && !loading && (
            <>
              <WeekCloseStep1BankBalance snap={snap} onRefresh={refresh} />
              <WeekCloseStep2Breakdown snap={snap} onAnyAction={refresh} />
              <WeekCloseStep3Anchor
                snap={snap}
                anchor={anchor}
                onAnchorChange={setAnchor}
                varianceResolution={varianceResolution}
                onVarianceResolutionChange={setVarianceResolution}
              />
            </>
          )}
        </div>
        <div className="border-t border-border/50 px-4 py-3 flex gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            className="flex-1"
            disabled={committing}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleCommit}
            disabled={!snap || committing}
            className="flex-1"
          >
            {committing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            {anchor ? "Cerrar y anclar" : "Cerrar semana"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
