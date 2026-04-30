"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/opai";
import { Spinner } from "@/components/opai-ds";
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

/* ── Props ────────────────────────────────────────────────────────────── */

interface AsistenciaDiariaClientProps {
  initialClients: ClientOption[];
  guardias: GuardiaOption[];
  userRole: string;
}

/* ── Component ────────────────────────────────────────────────────────── */

export function AsistenciaDiariaClient({
  initialClients,
  guardias,
  userRole,
}: AsistenciaDiariaClientProps) {
  // ── Desktop detection ─────────────────────────────────────────────────

  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 768px)");
    setIsDesktop(m.matches);
    const handler = () => setIsDesktop(m.matches);
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, []);

  // ── Permissions ───────────────────────────────────────────────────────

  const canManagePaidTeReset = userRole === "owner" || userRole === "admin";
  const canExecuteOps = hasOpsCapability(userRole, "ops_execution");

  // ── Hook ──────────────────────────────────────────────────────────────

  const hook = useAsistenciaDiaria({ initialClients, guardias });

  // ── Modal/sheet state ─────────────────────────────────────────────────

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
  const [allSectionsState, setAllSectionsState] = useState<"default" | "all-collapsed" | "all-expanded">("default");

  // ── Action handlers ───────────────────────────────────────────────────

  const handleMarkPresent = useCallback((item: AsistenciaItem) => {
    setAsistioItem(item);
  }, []);

  const handleMarkAbsent = useCallback((item: AsistenciaItem) => {
    setAusenteItem(item);
  }, []);

  const handleAssignReplacement = useCallback((item: AsistenciaItem) => {
    setReplacementItem(item);
  }, []);

  const handleReset = useCallback((item: AsistenciaItem) => {
    setResetItem(item);
  }, []);

  const handleViewMarcacion = useCallback((marcaciones: AsistenciaItem["marcaciones"]) => {
    setMarcacionDetalle(marcaciones ?? null);
  }, []);

  // Guard selected from search → open SheetMontoTE
  const handleGuardSelected = useCallback(
    (guard: GuardiaOption) => {
      if (!replacementItem) return;
      setReplacementItem(null);
      setMontoTeState({ item: replacementItem, guard });
    },
    [replacementItem]
  );

  // Confirm replacement with TE amount
  const handleConfirmReemplazo = useCallback(
    async (data: { guardId: string; amount: number; justification?: string }) => {
      if (!montoTeState) return;
      const { item } = montoTeState;
      const baseAmount = Number(item.puesto.teMontoClp) || 0;
      const isModified = data.amount !== baseAmount;

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
    [montoTeState, hook]
  );

  // Wrapper for absent that handles contradiction
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

  // ── Export handler ────────────────────────────────────────────────────

  const handleExportHE = useCallback(() => {
    const params = new URLSearchParams({ from: hook.selectedDate, to: hook.selectedDate });
    window.open(`/api/ops/asistencia/export-horas-extra?${params.toString()}`, "_blank");
  }, [hook.selectedDate]);

  // ── Render ────────────────────────────────────────────────────────────

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
      />

      {/* Content */}
      {hook.loading && hook.items.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="md" />
        </div>
      ) : hook.items.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={<CalendarCheck2 className="h-8 w-8 text-white" />}
              title="Sin asistencia"
              description="No hay puestos para la fecha seleccionada. Genera primero la pauta mensual."
              compact
            />
          </CardContent>
        </Card>
      ) : (
        <div className={`space-y-2 ${hook.loading ? "opacity-80 transition-opacity" : "opacity-100 transition-opacity"}`}>
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
              onSectionToggle={() => { setAllSectionsState("default"); }}
              onMarkPresent={handleMarkPresent}
              onMarkAbsent={handleMarkAbsent}
              onAssignReplacement={handleAssignReplacement}
              onReset={handleReset}
              onViewMarcacion={handleViewMarcacion}
            />
          ))}
        </div>
      )}

      {/* ── Modals & Sheets ──────────────────────────────────────────── */}

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
        onClose={() => setReplacementItem(null)}
        item={replacementItem}
        isDesktop={isDesktop}
        guardias={guardias}
        filterGuardias={hook.filterGuardias}
        onSelect={handleGuardSelected}
      />

      <SheetMontoTE
        open={!!montoTeState}
        onClose={() => setMontoTeState(null)}
        guard={montoTeState?.guard ?? null}
        baseAmount={
          montoTeState
            ? Number(montoTeState.item.puesto.teMontoClp) || 0
            : 0
        }
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
