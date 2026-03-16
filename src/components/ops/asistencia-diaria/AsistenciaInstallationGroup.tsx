"use client";

import { CollapsibleSection } from "@/components/crm/CollapsibleSection";
import { AsistenciaShiftCard } from "./AsistenciaShiftCard";
import type { AsistenciaItem } from "@/types/ops-asistencia";

interface AsistenciaInstallationGroupProps {
  installationId: string;
  installationName: string;
  items: AsistenciaItem[];
  isDesktop: boolean;
  canExecuteOps: boolean;
  savingId: string | null;
  allSectionsState: "default" | "all-collapsed" | "all-expanded";
  onSectionToggle: (nextOpen: boolean) => void;
  // Actions
  onMarkPresent: (item: AsistenciaItem) => void;
  onMarkAbsent: (item: AsistenciaItem) => void;
  onAssignReplacement: (item: AsistenciaItem) => void;
  onReset: (item: AsistenciaItem) => void;
  onViewMarcacion: (marcaciones: AsistenciaItem["marcaciones"]) => void;
}

export function AsistenciaInstallationGroup({
  installationId,
  installationName,
  items,
  isDesktop,
  canExecuteOps,
  savingId,
  allSectionsState,
  onSectionToggle,
  onMarkPresent,
  onMarkAbsent,
  onAssignReplacement,
  onReset,
  onViewMarcacion,
}: AsistenciaInstallationGroupProps) {
  const covered = items.filter(
    (i) => i.attendanceStatus === "asistio" || i.attendanceStatus === "reemplazo"
  ).length;

  return (
    <CollapsibleSection
      key={installationId}
      title={installationName}
      count={items.length}
      badge={`${covered}/${items.length}`}
      defaultOpen={true}
      open={
        allSectionsState === "all-collapsed"
          ? false
          : allSectionsState === "all-expanded"
            ? true
            : undefined
      }
      onToggle={onSectionToggle}
      className="overflow-visible"
    >
      {/* Desktop column headers */}
      {isDesktop && (
        <div className="hidden md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,150px)_auto] md:gap-x-3 md:pb-1 md:border-b md:border-border/60">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Puesto</span>
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Planificado</span>
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Reemplazo</span>
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Marcación</span>
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Acciones</span>
        </div>
      )}

      <div className="space-y-1">
        {items.map((item) => (
          <AsistenciaShiftCard
            key={item.id}
            item={item}
            isDesktop={isDesktop}
            canExecuteOps={canExecuteOps}
            savingId={savingId}
            onMarkPresent={onMarkPresent}
            onMarkAbsent={onMarkAbsent}
            onAssignReplacement={onAssignReplacement}
            onReset={onReset}
            onViewMarcacion={onViewMarcacion}
          />
        ))}
      </div>
    </CollapsibleSection>
  );
}
