"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarCheck2 } from "lucide-react";
import { toast } from "sonner";
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
import { EmptyState, Spinner } from "@/components/opai-ds";
import { hasOpsCapability } from "@/lib/ops-rbac";
import { useAsistenciaDiaria } from "@/hooks/useAsistenciaDiaria";
import type { AsistenciaItem, GuardiaOption, MarcacionItem } from "@/types/ops-asistencia";
import type { ContradictionState } from "./modals/ModalContradiccion";

import { AsistenciaDiaSheetHeader } from "./AsistenciaDiaSheetHeader";
import { AsistenciaDiaSheetModals } from "./AsistenciaDiaSheetModals";
import { AsistenciaInstallationGroup } from "./AsistenciaInstallationGroup";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function shiftDate(dateKey: string, dir: -1 | 1): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + dir);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<boolean>
): Promise<{ ok: number; fail: number }> {
  let ok = 0;
  let fail = 0;
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      if (await fn(items[i])) ok++;
      else fail++;
    }
  });
  await Promise.all(workers);
  return { ok, fail };
}

export interface AsistenciaDiaSheetProps {
  open: boolean;
  onClose: (dirty: boolean) => void;
  date: string;
  onDateChange: (date: string) => void;
  installationId: string;
  installationName: string;
  guardias: GuardiaOption[];
  userRole: string;
  minDate?: string;
  maxDate?: string;
}

export function AsistenciaDiaSheet({
  open,
  onClose,
  date,
  onDateChange,
  installationId,
  installationName,
  guardias,
  userRole,
  minDate,
  maxDate,
}: AsistenciaDiaSheetProps) {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 768px)");
    setIsDesktop(m.matches);
    const handler = () => setIsDesktop(m.matches);
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, []);

  const canManagePaidTeReset = userRole === "owner" || userRole === "admin";
  const canExecuteOps = hasOpsCapability(userRole, "ops_execution");

  const hook = useAsistenciaDiaria({
    initialClients: [],
    guardias,
    installationId,
    date,
    enabled: open,
  });

  const dirtyRef = useRef(false);
  useEffect(() => {
    if (open) dirtyRef.current = false;
  }, [open]);

  const patchTracked = useCallback(
    async (id: string, payload: Record<string, unknown>) => {
      const result = await hook.patchAsistencia(id, payload);
      if (result.ok) dirtyRef.current = true;
      return result;
    },
    [hook]
  );

  const [asistioItem, setAsistioItem] = useState<AsistenciaItem | null>(null);
  const [ausenteItem, setAusenteItem] = useState<AsistenciaItem | null>(null);
  const [replacementItem, setReplacementItem] = useState<AsistenciaItem | null>(null);
  const [montoTeState, setMontoTeState] = useState<{
    item: AsistenciaItem;
    guard: GuardiaOption;
  } | null>(null);
  const [resetItem, setResetItem] = useState<AsistenciaItem | null>(null);
  const [marcacionDetalle, setMarcacionDetalle] = useState<MarcacionItem[] | null>(null);
  const [contradiction, setContradiction] = useState<ContradictionState | null>(null);
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  const handleClose = useCallback(() => onClose(dirtyRef.current), [onClose]);

  const canGoPrev = !minDate || shiftDate(date, -1) >= minDate;
  const canGoNext = !maxDate || shiftDate(date, 1) <= maxDate;

  const eligibleItems = useMemo(
    () =>
      hook.items.filter(
        (item) => item.attendanceStatus === "pendiente" && item.plannedGuardiaId != null
      ),
    [hook.items]
  );

  const pendientes = useMemo(
    () => hook.items.filter((i) => i.attendanceStatus === "pendiente").length,
    [hook.items]
  );

  const handleBulkMark = useCallback(async () => {
    setBulkLoading(true);
    try {
      const { ok, fail } = await mapPool(eligibleItems, 4, async (item) => {
        const day = item.date.slice(0, 10);
        const result = await patchTracked(item.id, {
          checkInAt: `${day}T${item.puesto.shiftStart}:00.000Z`,
          checkOutAt: `${day}T${item.puesto.shiftEnd}:00.000Z`,
          attendanceStatus: "asistio",
          actualGuardiaId: item.actualGuardiaId ?? item.plannedGuardiaId ?? null,
        });
        return result.ok;
      });
      if (fail === 0) toast.success(`${ok} marcados`);
      else toast.warning(`${ok} marcados · ${fail} con error`);
    } finally {
      setBulkLoading(false);
      setConfirmBulkOpen(false);
    }
  }, [eligibleItems, patchTracked]);

  const handleConfirmReemplazo = useCallback(
    async (data: { guardId: string; amount: number; justification?: string }) => {
      if (!montoTeState) return;
      const { item } = montoTeState;
      const baseAmount = Number(item.puesto.teMontoClp) || 0;
      const payload: Record<string, unknown> = {
        attendanceStatus: "reemplazo",
        replacementGuardiaId: data.guardId,
      };
      if (data.amount !== baseAmount) {
        payload.teAmountOverride = data.amount;
        payload.teAmountJustification = data.justification;
      }
      const result = await patchTracked(item.id, payload);
      if (result.ok) {
        toast.success("Reemplazo asignado");
        setMontoTeState(null);
      }
    },
    [montoTeState, patchTracked]
  );

  const handlePatchWithContradiction = useCallback(
    async (id: string, payload: Record<string, unknown>) => {
      const result = await patchTracked(id, payload);
      if (!result.ok && result.code === "CONTRADICCION_MARCACION_ELECTRONICA") {
        setContradiction({
          id,
          payload,
          message: result.error ?? "",
          successMessage: "No asistió",
        });
      }
      return result;
    },
    [patchTracked]
  );

  if (!DATE_RE.test(date)) return null;

  const body = (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      <AsistenciaDiaSheetHeader
        date={date}
        installationName={installationName}
        metrics={hook.metrics}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
        onPrev={() => {
          if (canGoPrev) onDateChange(shiftDate(date, -1));
        }}
        onNext={() => {
          if (canGoNext) onDateChange(shiftDate(date, 1));
        }}
        canExecuteOps={canExecuteOps}
        eligibleCount={eligibleItems.length}
        bulkLoading={bulkLoading}
        onBulkMark={() => setConfirmBulkOpen(true)}
        pendientes={pendientes}
      />

      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        {hook.loading && hook.items.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="md" />
          </div>
        ) : hook.items.length === 0 ? (
          <EmptyState
            icon={CalendarCheck2}
            title="Sin turnos planificados para este día"
            description="No hay puestos con turno de trabajo en esta fecha."
            compact
          />
        ) : (
          <div className={hook.loading ? "opacity-80" : "opacity-100"}>
            {hook.groupedByInstallation.map(([instId, group]) => (
              <AsistenciaInstallationGroup
                key={instId}
                installationId={instId}
                installationName={group.name}
                items={group.items}
                isDesktop={isDesktop}
                canExecuteOps={canExecuteOps}
                savingId={hook.savingId}
                allSectionsState="all-expanded"
                onSectionToggle={() => {}}
                onMarkPresent={setAsistioItem}
                onMarkAbsent={setAusenteItem}
                onAssignReplacement={setReplacementItem}
                onReset={setResetItem}
                onViewMarcacion={(m) => setMarcacionDetalle(m ?? null)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const modals = (
    <AsistenciaDiaSheetModals
      isDesktop={isDesktop}
      isSaving={!!hook.savingId}
      canManagePaidTeReset={canManagePaidTeReset}
      guardias={guardias}
      filterGuardias={hook.filterGuardias}
      patchAsistencia={patchTracked}
      patchWithContradiction={handlePatchWithContradiction}
      asistioItem={asistioItem}
      onCloseAsistio={() => setAsistioItem(null)}
      ausenteItem={ausenteItem}
      onCloseAusente={() => setAusenteItem(null)}
      onOpenBuscarReemplazo={setReplacementItem}
      replacementItem={replacementItem}
      onCloseReplacement={() => setReplacementItem(null)}
      onSelectGuard={(guard) => {
        if (!replacementItem) return;
        setReplacementItem(null);
        setMontoTeState({ item: replacementItem, guard });
      }}
      montoTeState={montoTeState}
      onCloseMontoTe={() => setMontoTeState(null)}
      onConfirmReemplazo={handleConfirmReemplazo}
      resetItem={resetItem}
      onCloseReset={() => setResetItem(null)}
      marcacionDetalle={marcacionDetalle}
      onCloseMarcacion={() => setMarcacionDetalle(null)}
      contradiction={contradiction}
      onCloseContradiction={() => setContradiction(null)}
      confirmBulkOpen={confirmBulkOpen}
      onConfirmBulkOpenChange={setConfirmBulkOpen}
      eligibleCount={eligibleItems.length}
      bulkLoading={bulkLoading}
      onConfirmBulk={handleBulkMark}
    />
  );

  if (isDesktop) {
    return (
      <>
        <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
          <DialogContent className="sm:max-w-2xl max-h-[86vh] flex flex-col gap-0 overflow-hidden">
            <DialogHeader className="sr-only">
              <DialogTitle>Asistencia del día</DialogTitle>
            </DialogHeader>
            {body}
          </DialogContent>
        </Dialog>
        {modals}
      </>
    );
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <SheetContent
          side="bottom"
          className="max-h-[86vh] rounded-t-xl flex flex-col gap-0 overflow-hidden"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Asistencia del día</SheetTitle>
          </SheetHeader>
          <div className="mt-2 flex flex-col min-h-0 flex-1">{body}</div>
        </SheetContent>
      </Sheet>
      {modals}
    </>
  );
}
