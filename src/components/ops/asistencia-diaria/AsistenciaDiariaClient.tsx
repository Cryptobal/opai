"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, Spinner } from "@/components/opai-ds";
import { hasOpsCapability } from "@/lib/ops-rbac";
import { toast } from "sonner";

import { useAsistenciaDiaria } from "@/hooks/useAsistenciaDiaria";
import type {
  AsistenciaItem,
  ClientOption,
  GuardiaOption,
  MarcacionItem,
} from "@/types/ops-asistencia";

import { AsistenciaHeader } from "./AsistenciaHeader";
import { AsistenciaInstallationGroup } from "./AsistenciaInstallationGroup";
import { ModalMarcarAsistencia } from "./modals/ModalMarcarAsistencia";
import { ModalContradiccion, type ContradictionState } from "./modals/ModalContradiccion";
import { ModalDetalleMarcacion } from "./modals/ModalDetalleMarcacion";
import { SheetBuscarGuardia } from "./modals/SheetBuscarGuardia";
import { SheetMontoTE } from "./modals/SheetMontoTE";
import { SheetResetTurno } from "./modals/SheetResetTurno";
import { SheetMarcarAusente } from "./modals/SheetMarcarAusente";
import { SheetRetiroAnticipado } from "./modals/SheetRetiroAnticipado";
import { SheetCrearPpcAdhoc } from "./modals/SheetCrearPpcAdhoc";

interface AsistenciaDiariaClientProps {
  initialClients: ClientOption[];
  guardias: GuardiaOption[];
  userRole: string;
}

type CoverMode = "reemplazo" | "retiro";

export function AsistenciaDiariaClient({
  initialClients,
  guardias,
  userRole,
}: AsistenciaDiariaClientProps) {
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

  const hook = useAsistenciaDiaria({ initialClients, guardias });

  const [asistioItem, setAsistioItem] = useState<AsistenciaItem | null>(null);
  const [ausenteItem, setAusenteItem] = useState<AsistenciaItem | null>(null);
  const [replacementItem, setReplacementItem] = useState<AsistenciaItem | null>(null);
  const [coverMode, setCoverMode] = useState<CoverMode>("reemplazo");
  const [retiroPending, setRetiroPending] = useState<{
    checkOutAt: string;
    reason: string;
  } | null>(null);
  const [montoTeState, setMontoTeState] = useState<{
    item: AsistenciaItem;
    guard: GuardiaOption;
  } | null>(null);
  const [resetItem, setResetItem] = useState<AsistenciaItem | null>(null);
  const [marcacionDetalle, setMarcacionDetalle] = useState<MarcacionItem[] | null>(null);
  const [contradiction, setContradiction] = useState<ContradictionState | null>(null);
  const [allSectionsState, setAllSectionsState] = useState<
    "default" | "all-collapsed" | "all-expanded"
  >("default");
  const [retiroItem, setRetiroItem] = useState<AsistenciaItem | null>(null);
  const [retiroCoverOnly, setRetiroCoverOnly] = useState(false);
  const [adhocOpen, setAdhocOpen] = useState(false);

  const handleMarkPresent = useCallback((item: AsistenciaItem) => {
    setAsistioItem(item);
  }, []);

  const handleMarkAbsent = useCallback((item: AsistenciaItem) => {
    setAusenteItem(item);
  }, []);

  const handleAssignReplacement = useCallback((item: AsistenciaItem) => {
    setCoverMode("reemplazo");
    setRetiroPending(null);
    setReplacementItem(item);
  }, []);

  const handleEarlyDeparture = useCallback((item: AsistenciaItem) => {
    setRetiroCoverOnly(false);
    setRetiroItem(item);
  }, []);

  const handleCoverEarlyDeparture = useCallback((item: AsistenciaItem) => {
    setRetiroCoverOnly(true);
    setRetiroItem(item);
  }, []);

  const handleRequestCoverFromRetiro = useCallback(
    (item: AsistenciaItem, pending: { checkOutAt: string; reason: string }) => {
      setRetiroPending(pending);
      setCoverMode("retiro");
      setReplacementItem(item);
    },
    []
  );

  const handleDeleteAdhoc = useCallback(
    async (item: AsistenciaItem) => {
      if (!window.confirm("¿Eliminar este PPC ad-hoc?")) return;
      const result = await hook.eliminarAdhoc(item.id);
      if (result.ok) toast.success("PPC ad-hoc eliminado");
    },
    [hook]
  );

  const handleReset = useCallback((item: AsistenciaItem) => {
    setResetItem(item);
  }, []);

  const handleViewMarcacion = useCallback((marcaciones: AsistenciaItem["marcaciones"]) => {
    setMarcacionDetalle(marcaciones ?? null);
  }, []);

  const handleGuardSelected = useCallback(
    (guard: GuardiaOption) => {
      if (!replacementItem) return;
      setReplacementItem(null);
      setMontoTeState({ item: replacementItem, guard });
    },
    [replacementItem]
  );

  const handleConfirmReemplazo = useCallback(
    async (data: { guardId: string; amount: number; justification?: string }) => {
      if (!montoTeState) return;
      const { item } = montoTeState;
      const baseAmount = Number(item.puesto.teMontoClp) || 0;
      const isModified = data.amount !== baseAmount;

      if (coverMode === "retiro") {
        const pending = retiroPending ?? {
          checkOutAt: item.checkOutAt ?? new Date().toISOString(),
          reason: item.earlyDepartureReason ?? "Retiro anticipado",
        };
        const result = await hook.retiroAnticipado(item.id, {
          checkOutAt: pending.checkOutAt,
          reason: pending.reason,
          cobertura: {
            guardiaId: data.guardId,
            ...(isModified
              ? { amountClp: data.amount, amountJustification: data.justification }
              : {}),
          },
        });
        if (result.ok) {
          toast.success("Retiro anticipado con cobertura");
          setMontoTeState(null);
          setRetiroPending(null);
          setCoverMode("reemplazo");
        }
        return;
      }

      const payload: Record<string, unknown> = {
        attendanceStatus: "reemplazo",
        replacementGuardiaId: data.guardId,
      };
      if (isModified) {
        payload.teAmountOverride = data.amount;
        payload.teAmountJustification = data.justification;
      }

      const result = await hook.patchAsistencia(item.id, payload);
      if (result.ok) {
        toast.success("Reemplazo asignado");
        setMontoTeState(null);
      }
    },
    [montoTeState, hook, coverMode, retiroPending]
  );

  const handlePatchWithContradiction = useCallback(
    async (id: string, payload: Record<string, unknown>): ReturnType<typeof hook.patchAsistencia> => {
      const result = await hook.patchAsistencia(id, payload);
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
    [hook]
  );

  const handleExportHE = useCallback(() => {
    const params = new URLSearchParams({ from: hook.selectedDate, to: hook.selectedDate });
    window.open(`/api/ops/asistencia/export-horas-extra?${params.toString()}`, "_blank");
  }, [hook.selectedDate]);

  return (
    <div className="space-y-2">
      <AsistenciaHeader
        selectedDate={hook.selectedDate}
        onDateChange={hook.setSelectedDate}
        onNavigateDate={hook.navigateDate}
        isToday={hook.isToday}
        metrics={hook.metrics}
        shiftFilter={hook.shiftFilter}
        onShiftFilterChange={hook.setShiftFilter}
        kpiFilter={hook.kpiFilter}
        onKpiFilterChange={hook.handleKpiClick}
        searchQuery={hook.searchQuery}
        onSearchChange={hook.setSearchQuery}
        isDesktop={isDesktop}
        onExportHE={handleExportHE}
        loading={hook.loading}
        hasItems={hook.items.length > 0}
        canExecuteOps={canExecuteOps}
        onCreateAdhoc={() => setAdhocOpen(true)}
      />

      {hook.loading && hook.items.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="md" />
        </div>
      ) : hook.items.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={CalendarCheck2}
              title="Sin asistencia"
              description="No hay puestos para la fecha seleccionada. Genera primero la pauta mensual o crea un PPC ad-hoc."
              compact
            />
          </CardContent>
        </Card>
      ) : (
        <div
          className={`space-y-2 ${hook.loading ? "opacity-80 transition-opacity" : "opacity-100 transition-opacity"}`}
        >
          {hook.groupedByInstallation.map(([instId, group]) => (
            <AsistenciaInstallationGroup
              key={instId}
              installationId={instId}
              installationName={group.name}
              items={group.items}
              isDesktop={isDesktop}
              canExecuteOps={canExecuteOps}
              savingId={hook.savingId}
              allSectionsState={allSectionsState}
              onSectionToggle={() => {
                setAllSectionsState("default");
              }}
              onMarkPresent={handleMarkPresent}
              onMarkAbsent={handleMarkAbsent}
              onAssignReplacement={handleAssignReplacement}
              onReset={handleReset}
              onViewMarcacion={handleViewMarcacion}
              onEarlyDeparture={handleEarlyDeparture}
              onCoverEarlyDeparture={handleCoverEarlyDeparture}
              onDeleteAdhoc={handleDeleteAdhoc}
            />
          ))}
        </div>
      )}

      <ModalMarcarAsistencia
        item={asistioItem}
        open={!!asistioItem}
        onClose={() => setAsistioItem(null)}
        isSaving={!!hook.savingId}
        patchAsistencia={hook.patchAsistencia}
      />

      <SheetMarcarAusente
        open={!!ausenteItem}
        onClose={() => setAusenteItem(null)}
        item={ausenteItem}
        isDesktop={isDesktop}
        isSaving={!!hook.savingId}
        patchAsistencia={handlePatchWithContradiction}
        onOpenBuscarReemplazo={handleAssignReplacement}
      />

      <SheetBuscarGuardia
        open={!!replacementItem}
        onClose={() => {
          setReplacementItem(null);
          if (coverMode === "retiro") {
            setRetiroPending(null);
            setCoverMode("reemplazo");
          }
        }}
        item={replacementItem}
        isDesktop={isDesktop}
        guardias={guardias}
        filterGuardias={hook.filterGuardias}
        onSelect={handleGuardSelected}
      />

      <SheetMontoTE
        open={!!montoTeState}
        onClose={() => {
          setMontoTeState(null);
          if (coverMode === "retiro") {
            setRetiroPending(null);
            setCoverMode("reemplazo");
          }
        }}
        guard={montoTeState?.guard ?? null}
        baseAmount={montoTeState ? Number(montoTeState.item.puesto.teMontoClp) || 0 : 0}
        isDesktop={isDesktop}
        isSaving={!!hook.savingId}
        onConfirm={handleConfirmReemplazo}
      />

      <SheetResetTurno
        open={!!resetItem}
        onClose={() => setResetItem(null)}
        item={resetItem}
        isDesktop={isDesktop}
        canManagePaidTeReset={canManagePaidTeReset}
        isSaving={!!hook.savingId}
        patchAsistencia={hook.patchAsistencia}
      />

      <SheetRetiroAnticipado
        open={!!retiroItem}
        onClose={() => {
          setRetiroItem(null);
          setRetiroCoverOnly(false);
        }}
        item={retiroItem}
        isDesktop={isDesktop}
        isSaving={!!hook.savingId}
        coverOnly={retiroCoverOnly}
        retiroAnticipado={hook.retiroAnticipado}
        onRequestCover={handleRequestCoverFromRetiro}
      />

      <SheetCrearPpcAdhoc
        open={adhocOpen}
        onClose={() => setAdhocOpen(false)}
        isDesktop={isDesktop}
        isSaving={hook.savingId === "adhoc"}
        selectedDate={hook.selectedDate}
        clients={hook.clients}
        crearAdhoc={hook.crearAdhoc}
      />

      <ModalDetalleMarcacion
        marcaciones={marcacionDetalle}
        onClose={() => setMarcacionDetalle(null)}
      />

      <ModalContradiccion
        state={contradiction}
        onClose={() => setContradiction(null)}
        isSaving={!!hook.savingId}
        patchAsistencia={hook.patchAsistencia}
      />
    </div>
  );
}
