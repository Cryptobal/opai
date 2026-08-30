"use client";

import type { AsistenciaItem, ClientOption, GuardiaOption, MarcacionItem } from "@/types/ops-asistencia";
import type { PatchResult } from "@/hooks/useAsistenciaDiaria";
import type { ContradictionState } from "./modals/ModalContradiccion";
import { ModalMarcarAsistencia } from "./modals/ModalMarcarAsistencia";
import { ModalContradiccion } from "./modals/ModalContradiccion";
import { ModalDetalleMarcacion } from "./modals/ModalDetalleMarcacion";
import { SheetBuscarGuardia } from "./modals/SheetBuscarGuardia";
import { SheetMontoTE } from "./modals/SheetMontoTE";
import { SheetResetTurno } from "./modals/SheetResetTurno";
import { SheetMarcarAusente } from "./modals/SheetMarcarAusente";
import { SheetRetiroAnticipado } from "./modals/SheetRetiroAnticipado";
import { SheetCrearPpcAdhoc } from "./modals/SheetCrearPpcAdhoc";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface AsistenciaDiaSheetModalsProps {
  isDesktop: boolean;
  isSaving: boolean;
  canManagePaidTeReset: boolean;
  guardias: GuardiaOption[];
  filterGuardias: (query: string) => GuardiaOption[];
  patchAsistencia: (id: string, body: Record<string, unknown>) => Promise<PatchResult>;
  patchWithContradiction: (id: string, body: Record<string, unknown>) => Promise<PatchResult>;
  asistioItem: AsistenciaItem | null;
  onCloseAsistio: () => void;
  ausenteItem: AsistenciaItem | null;
  onCloseAusente: () => void;
  onOpenBuscarReemplazo: (item: AsistenciaItem) => void;
  replacementItem: AsistenciaItem | null;
  onCloseReplacement: () => void;
  onSelectGuard: (guard: GuardiaOption) => void;
  montoTeState: { item: AsistenciaItem; guard: GuardiaOption } | null;
  onCloseMontoTe: () => void;
  onConfirmReemplazo: (data: {
    guardId: string;
    amount: number;
    justification?: string;
  }) => Promise<void>;
  resetItem: AsistenciaItem | null;
  onCloseReset: () => void;
  marcacionDetalle: MarcacionItem[] | null;
  onCloseMarcacion: () => void;
  contradiction: ContradictionState | null;
  onCloseContradiction: () => void;
  confirmBulkOpen: boolean;
  onConfirmBulkOpenChange: (open: boolean) => void;
  eligibleCount: number;
  bulkLoading: boolean;
  onConfirmBulk: () => void | Promise<void>;
  // Retiro anticipado / ad-hoc
  retiroItem: AsistenciaItem | null;
  retiroCoverOnly: boolean;
  onCloseRetiro: () => void;
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
  onRequestCoverFromRetiro: (
    item: AsistenciaItem,
    pending: { checkOutAt: string; reason: string }
  ) => void;
  adhocOpen: boolean;
  onCloseAdhoc: () => void;
  selectedDate: string;
  clients: ClientOption[];
  defaultInstallationId?: string;
  crearAdhoc: (payload: {
    installationId: string;
    puestoId: string;
    date: string;
    reason: "induccion" | "refuerzo" | "otro";
    shiftStart?: string;
    shiftEnd?: string;
    notes?: string | null;
  }) => Promise<PatchResult>;
  isSavingAdhoc: boolean;
}

export function AsistenciaDiaSheetModals({
  isDesktop,
  isSaving,
  canManagePaidTeReset,
  guardias,
  filterGuardias,
  patchAsistencia,
  patchWithContradiction,
  asistioItem,
  onCloseAsistio,
  ausenteItem,
  onCloseAusente,
  onOpenBuscarReemplazo,
  replacementItem,
  onCloseReplacement,
  onSelectGuard,
  montoTeState,
  onCloseMontoTe,
  onConfirmReemplazo,
  resetItem,
  onCloseReset,
  marcacionDetalle,
  onCloseMarcacion,
  contradiction,
  onCloseContradiction,
  confirmBulkOpen,
  onConfirmBulkOpenChange,
  eligibleCount,
  bulkLoading,
  onConfirmBulk,
  retiroItem,
  retiroCoverOnly,
  onCloseRetiro,
  retiroAnticipado,
  onRequestCoverFromRetiro,
  adhocOpen,
  onCloseAdhoc,
  selectedDate,
  clients,
  defaultInstallationId,
  crearAdhoc,
  isSavingAdhoc,
}: AsistenciaDiaSheetModalsProps) {
  return (
    <>
      <ModalMarcarAsistencia
        item={asistioItem}
        open={!!asistioItem}
        onClose={onCloseAsistio}
        isSaving={isSaving}
        patchAsistencia={patchAsistencia}
      />
      <SheetMarcarAusente
        open={!!ausenteItem}
        onClose={onCloseAusente}
        item={ausenteItem}
        isDesktop={isDesktop}
        isSaving={isSaving}
        patchAsistencia={patchWithContradiction}
        onOpenBuscarReemplazo={onOpenBuscarReemplazo}
      />
      <SheetBuscarGuardia
        open={!!replacementItem}
        onClose={onCloseReplacement}
        item={replacementItem}
        isDesktop={isDesktop}
        guardias={guardias}
        filterGuardias={filterGuardias}
        onSelect={onSelectGuard}
      />
      <SheetMontoTE
        open={!!montoTeState}
        onClose={onCloseMontoTe}
        guard={montoTeState?.guard ?? null}
        baseAmount={montoTeState ? Number(montoTeState.item.puesto.teMontoClp) || 0 : 0}
        isDesktop={isDesktop}
        isSaving={isSaving}
        onConfirm={onConfirmReemplazo}
      />
      <SheetResetTurno
        open={!!resetItem}
        onClose={onCloseReset}
        item={resetItem}
        isDesktop={isDesktop}
        canManagePaidTeReset={canManagePaidTeReset}
        isSaving={isSaving}
        patchAsistencia={patchAsistencia}
      />
      <SheetRetiroAnticipado
        open={!!retiroItem}
        onClose={onCloseRetiro}
        item={retiroItem}
        isDesktop={isDesktop}
        isSaving={isSaving}
        coverOnly={retiroCoverOnly}
        retiroAnticipado={retiroAnticipado}
        onRequestCover={onRequestCoverFromRetiro}
      />
      <SheetCrearPpcAdhoc
        open={adhocOpen}
        onClose={onCloseAdhoc}
        isDesktop={isDesktop}
        isSaving={isSavingAdhoc}
        selectedDate={selectedDate}
        clients={clients}
        defaultInstallationId={defaultInstallationId}
        crearAdhoc={crearAdhoc}
      />
      <ModalDetalleMarcacion marcaciones={marcacionDetalle} onClose={onCloseMarcacion} />
      <ModalContradiccion
        state={contradiction}
        onClose={onCloseContradiction}
        isSaving={isSaving}
        patchAsistencia={patchAsistencia}
      />
      <ConfirmDialog
        open={confirmBulkOpen}
        onOpenChange={onConfirmBulkOpenChange}
        title="Marcar todos con horario planificado"
        description={
          <>
            Se marcarán <strong>{eligibleCount}</strong> turno
            {eligibleCount === 1 ? "" : "s"} pendientes con guardia planificado usando las horas
            del puesto. Podés corregir turno por turno después.
          </>
        }
        confirmLabel={`Marcar ${eligibleCount}`}
        cancelLabel="Cancelar"
        variant="default"
        loading={bulkLoading}
        onConfirm={onConfirmBulk}
      />
    </>
  );
}
