"use client";
import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Loader2, PencilLine } from "lucide-react";
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

/** ¿Anclar esta semana retrocedería el ancla vigente? Ocurre cuando el cierre de
 *  la semana es ANTERIOR al del ancla actual: la proyección pasaría a partir del
 *  saldo de esta semana (más viejo) y toda la caja proyectada se desplomaría. */
function wouldRewindAnchor(d: WeeklyCloseSnapshotDTO): boolean {
  if (!d.currentAnchor) return false;
  return (
    new Date(d.weekEndDate).getTime() <
    new Date(d.currentAnchor.weekEndDate).getTime()
  );
}

/** ¿Es la semana MÁS RECIENTE cerrable? Solo entonces anclar es el default
 *  seguro. Es la más reciente si su cierre no es anterior al de la semana en
 *  curso (no es un backfill) y no retrocede el ancla vigente. */
function isMostRecentClosableWeek(d: WeeklyCloseSnapshotDTO): boolean {
  const thisEnd = new Date(d.weekEndDate).getTime();
  if (
    d.nextClosingWeekEndDate &&
    thisEnd < new Date(d.nextClosingWeekEndDate).getTime()
  ) {
    return false;
  }
  return !wouldRewindAnchor(d);
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
  // El anchor solo viene marcado por defecto si esta es la semana MÁS RECIENTE
  // cerrable. Para semanas atrasadas (backfill de cierres) el default es false:
  // cerrarlas es correcto, pero anclarlas retrocedería la proyección. El valor
  // real se deriva del snapshot al abrir (ver refresh()).
  const [anchor, setAnchor] = useState(false);
  // Solo se fija el default de anchor una vez por apertura del drawer, para no
  // pisar la elección del usuario cuando refresh() se dispara tras una acción
  // del paso 2.
  const anchorInitialized = useRef(false);
  // El backend rechazó anclar por retroceso del ancla (409): forzamos la
  // advertencia visible y pedimos reconfirmar en vez de un toast genérico.
  const [serverFlaggedRewind, setServerFlaggedRewind] = useState(false);
  const [varianceResolution, setVarianceResolution] =
    useState<VarianceResolution>("PENDING");
  // Cierre manual: el usuario sella la semana con un saldo que él define (no el
  // banco calculado). Necesario para semanas futuras (sin cartola aún) o para
  // forzar un número. El backend lo persiste como forcedBalanceClp + motivo.
  const [manual, setManual] = useState(false);
  const [forcedBalance, setForcedBalance] = useState("");
  const [manualReason, setManualReason] = useState("");

  // La semana es futura si su cierre cae después de hoy: ahí no hay saldo banco
  // real que confirmar, así que arrancamos en modo manual por defecto.
  const isFutureWeek = weekEndIso
    ? new Date(weekEndIso).getTime() > Date.now()
    : false;

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
      // Default del anchor = solo si es la semana más reciente cerrable. Se fija
      // una vez por apertura (no en cada refresh de acción del paso 2).
      if (!anchorInitialized.current) {
        setAnchor(isMostRecentClosableWeek(j.data));
        anchorInitialized.current = true;
      }
      // Prefill del monto manual con el proyectado al cierre (buen punto de
      // partida) si el campo aún está vacío.
      setForcedBalance((prev) =>
        prev === "" ? String(Math.round(j.data.projectedBalanceClp ?? 0)) : prev,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error cargando snapshot");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    // Reset del formulario manual y del estado de anclaje al abrir cada semana.
    setManual(isFutureWeek);
    setForcedBalance("");
    setManualReason("");
    anchorInitialized.current = false;
    setServerFlaggedRewind(false);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, weekEndIso]);

  const forcedBalanceNum = Number(forcedBalance);
  const manualValid =
    !manual ||
    (forcedBalance !== "" &&
      Number.isFinite(forcedBalanceNum) &&
      manualReason.trim().length >= 5);

  // Anclar esta semana retrocedería el ancla (weekEnd < ancla vigente). La
  // advertencia se activa solo cuando el usuario tiene el anchor marcado, o
  // cuando el backend lo bloqueó por un retroceso que el cliente no detectó.
  const wouldRewind = snap ? wouldRewindAnchor(snap) : false;
  const rewindActive = anchor && (wouldRewind || serverFlaggedRewind);

  async function handleCommit() {
    if (!snap) return;
    if (!manualValid) {
      toast.error("Ingresá el monto y un motivo (mín. 5 caracteres)");
      return;
    }
    setCommitting(true);
    try {
      // Solo autorizamos el retroceso del ancla si la advertencia ya se mostró
      // (anchor marcado sobre una semana anterior al ancla, o el backend lo
      // marcó vía 409) — o sea, el usuario lo vio y aun así confirmó.
      const allowAnchorRewind = anchor && (wouldRewind || serverFlaggedRewind);
      const body = manual
        ? {
            weekEnd: weekEndIso,
            anchor,
            allowAnchorRewind,
            mode: "manual" as const,
            forcedBalanceClp: Math.round(forcedBalanceNum),
            manualReason: manualReason.trim(),
          }
        : {
            weekEnd: weekEndIso,
            anchor,
            allowAnchorRewind,
            varianceResolution,
          };
      const res = await fetch("/api/finance/cashflow/weekly-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (res.status === 409 && j.code === "ANCHOR_REWIND") {
        // El backend detectó el retroceso (el ancla cambió bajo nuestros pies):
        // mostramos la advertencia y pedimos reconfirmar, sin toast genérico.
        setServerFlaggedRewind(true);
        toast.warning(
          "Anclar esta semana retrocedería la proyección. Revisá el aviso y confirmá de nuevo.",
        );
        return;
      }
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

  const weekEndLabel = weekEndIso
    ? new Date(weekEndIso).toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "";

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border/50">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" /> Cerrar semana
            {weekEndLabel && (
              <span className="text-sm font-normal text-muted-foreground">
                · {weekEndLabel}
              </span>
            )}
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
              {/* Toggle modo manual: sella la semana con un saldo definido por
                  el usuario. Obligatorio en semanas futuras (sin cartola). */}
              <label className="flex items-start gap-2.5 rounded-md border border-border/60 px-3 py-2.5 cursor-pointer hover:bg-muted/30">
                <input
                  type="checkbox"
                  checked={manual}
                  onChange={(e) => setManual(e.target.checked)}
                  className="mt-1"
                />
                <div className="flex-1 text-sm">
                  <div className="flex items-center gap-1.5 font-medium">
                    <PencilLine className="h-3.5 w-3.5 text-status-info-fg" />
                    Cerrar con monto manual
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isFutureWeek
                      ? "Esta semana es futura: no hay cartola aún, define el saldo con el que quieres sellarla."
                      : "Sella la semana con un saldo que tú defines, en vez del saldo banco calculado."}
                  </p>
                </div>
              </label>

              {manual ? (
                <section className="space-y-3">
                  <div className="rounded-md border border-border/60 divide-y divide-border/60">
                    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <span className="text-xs text-muted-foreground">
                        Saldo de cierre (manual)
                      </span>
                      <Input
                        value={forcedBalance}
                        inputMode="numeric"
                        onChange={(e) =>
                          setForcedBalance(e.target.value.replace(/[^\d-]/g, ""))
                        }
                        className="h-9 w-40 text-sm font-mono text-right"
                        placeholder="0"
                      />
                    </div>
                    <div className="px-3 py-2.5 space-y-1.5">
                      <span className="text-xs text-muted-foreground">
                        Motivo (queda en el historial)
                      </span>
                      <textarea
                        value={manualReason}
                        onChange={(e) => setManualReason(e.target.value)}
                        rows={2}
                        placeholder="Ej: cierre proyectado de la semana 28 según planificación"
                        className="w-full rounded-md border border-border/60 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/40"
                      />
                    </div>
                  </div>
                </section>
              ) : (
                <WeekCloseStep1BankBalance snap={snap} onRefresh={refresh} />
              )}
              <WeekCloseStep2Breakdown snap={snap} onAnyAction={refresh} />
              <WeekCloseStep3Anchor
                snap={snap}
                anchor={anchor}
                onAnchorChange={setAnchor}
                varianceResolution={varianceResolution}
                onVarianceResolutionChange={setVarianceResolution}
                displayBalanceClp={
                  manual && forcedBalance !== ""
                    ? Math.round(forcedBalanceNum)
                    : undefined
                }
                rewindActive={rewindActive}
                currentAnchorBalanceClp={snap.currentAnchor?.balanceClp ?? null}
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
            disabled={!snap || committing || !manualValid}
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
