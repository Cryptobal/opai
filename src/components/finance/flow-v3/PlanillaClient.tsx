"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";
import { usePlanillaMatrix } from "./usePlanillaMatrix";
import { usePlanillaActions } from "./usePlanillaActions";
import { PlanillaGrid } from "./PlanillaGrid";
import { AddRowDialog } from "./AddRowDialog";
import { fmtClp, fmtShortDate } from "./format";

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "danger" }) {
  const toneClass =
    tone === "danger" ? "text-status-danger-fg" : tone === "warn" ? "text-status-warn-fg" : "text-ds-text-1";
  return (
    <div className="rounded-md border border-ds-border-subtle bg-ds-surface-1 px-2.5 py-1">
      <div className="font-mono text-[11px] uppercase tracking-wide text-ds-text-4">{label}</div>
      <div className={`font-mono text-sm tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

export function PlanillaClient({ canManage, flagOn }: { canManage: boolean; flagOn: boolean }) {
  const router = useRouter();
  const isMobile = useIsMobileViewport();
  const m = usePlanillaMatrix({ isMobile });
  const actions = usePlanillaActions(m.refetch);
  const [addOpen, setAddOpen] = useState(false);
  const [archiving, setArchiving] = useState<FlowMatrixRowDto | null>(null);
  const [templateWarning, setTemplateWarning] = useState<string[] | null>(null);
  const [enabled, setEnabled] = useState(flagOn);
  const [togglingFlag, setTogglingFlag] = useState(false);
  const [confirmFlag, setConfirmFlag] = useState<null | boolean>(null);

  const toggleFlag = async (next: boolean) => {
    setTogglingFlag(true);
    try {
      const res = await fetch("/api/finance/flow-v3/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Error");
      setEnabled(json.data.enabled);
      toast.success(
        json.data.enabled
          ? "Modo Planilla activado en la navegación"
          : "Modo Planilla desactivado (volviste a la versión anterior)",
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cambiar el flag");
    } finally {
      setTogglingFlag(false);
      setConfirmFlag(null);
    }
  };

  const doArchive = async () => {
    if (!archiving) return;
    const r = await actions.archiveRow(archiving.id);
    setArchiving(null);
    if (r?.warning?.activeRecurringTemplateIds?.length) {
      setTemplateWarning(r.warning.activeRecurringTemplateIds);
    }
  };

  const kpis = m.data?.kpis;
  const minTone = kpis ? (kpis.minBalance < 0 ? "danger" : kpis.minBalance < (m.data?.warnThreshold ?? 0) ? "warn" : "ok") : undefined;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-1 text-base font-semibold text-ds-text-1">Flujo de Caja · Planilla</h1>
        {kpis && (
          <>
            <Kpi label="Saldo hoy" value={fmtClp(kpis.saldoHoy)} />
            <Kpi label="Mínimo horizonte" value={fmtClp(kpis.minBalance)} tone={minTone} />
            <Kpi label="Semana crítica" value={fmtShortDate(kpis.minWeek)} tone={minTone} />
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 px-1.5" onClick={m.goPrev} aria-label="Semanas anteriores">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={m.goToday}>
            Hoy
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-1.5" onClick={m.goNext} aria-label="Semanas siguientes">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <div className="ml-1 flex overflow-hidden rounded-md border border-ds-border-default">
            {(["week", "month"] as const).map((g) => (
              <button
                key={g}
                onClick={() => m.setGranularity(g)}
                className={`px-2 py-1 text-xs ${m.granularity === g ? "bg-primary text-primary-foreground" : "bg-ds-surface-1 text-ds-text-3 hover:bg-ds-surface-2"}`}
              >
                {g === "week" ? "Semanas" : "Meses"}
              </button>
            ))}
          </div>
          {canManage && (
            <Button size="sm" className="ml-1 h-7 px-2 text-xs" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Agregar concepto
            </Button>
          )}
          {canManage && (
            <Button
              variant={enabled ? "outline" : "default"}
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={togglingFlag}
              onClick={() => setConfirmFlag(!enabled)}
              title={
                enabled
                  ? "El Modo Planilla es la vista activa en la navegación"
                  : "Activar el Modo Planilla en la navegación del equipo"
              }
            >
              <Power className="mr-1 h-3.5 w-3.5" />
              {enabled ? "Activo en navegación" : "Activar en navegación"}
            </Button>
          )}
        </div>
      </div>

      {m.loading && !m.data ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-ds-border-subtle text-sm text-ds-text-3">
          Cargando planilla…
        </div>
      ) : m.data ? (
        <div className={m.loading ? "pointer-events-none opacity-60 transition-opacity" : ""}>
          <PlanillaGrid
            data={m.data}
            canManage={canManage}
            busy={actions.busy}
            patchPlan={m.patchPlan}
            onRename={(rowId, name) => void actions.renameRow(rowId, name)}
            onArchive={setArchiving}
            onSetEndDate={(templateId, endDate) => void actions.setTemplateEndDate(templateId, endDate)}
            onSetDiasCobro={(templateId, dias) => void actions.setTemplateDiasCobro(templateId, dias)}
            onBulkFill={actions.bulkFill}
            onSwipe={isMobile ? (dir) => (dir === "left" ? m.goNext() : m.goPrev()) : undefined}
          />
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center rounded-lg border border-ds-border-subtle text-sm text-status-danger-fg">
          No se pudo cargar la planilla.
        </div>
      )}

      <AddRowDialog open={addOpen} onOpenChange={setAddOpen} busy={actions.busy} onCreate={actions.createRow} />

      <ConfirmDialog
        open={archiving != null}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={`Archivar "${archiving?.name ?? ""}"`}
        description="La fila desaparece hacia adelante y reaparece sola al navegar a semanas donde tuvo movimiento. El plan histórico se conserva."
        confirmLabel="Archivar"
        loading={actions.busy}
        onConfirm={doArchive}
      />

      <ConfirmDialog
        open={templateWarning != null}
        onOpenChange={(o) => !o && setTemplateWarning(null)}
        title="La cuenta tiene programación de facturación activa"
        description="¿Desactivar también la programación? (fija su término a ayer; deja de emitir borradores y de proyectarse)"
        confirmLabel="Desactivar programación"
        cancelLabel="Mantenerla activa"
        loading={actions.busy}
        onConfirm={async () => {
          for (const id of templateWarning ?? []) await actions.deactivateTemplate(id);
          setTemplateWarning(null);
        }}
      />

      <ConfirmDialog
        open={confirmFlag != null}
        onOpenChange={(o) => !o && setConfirmFlag(null)}
        variant="default"
        title={confirmFlag ? "Activar Modo Planilla" : "Volver a la versión anterior"}
        description={
          confirmFlag
            ? "La navegación 'Flujo de Caja' de todo el equipo apuntará a esta planilla. El módulo anterior seguirá accesible con un banner. Puedes revertirlo cuando quieras."
            : "La navegación volverá al Flujo de Caja anterior. Esta planilla seguirá accesible por su URL directa y tus datos quedan intactos."
        }
        confirmLabel={confirmFlag ? "Activar" : "Desactivar"}
        cancelLabel="Cancelar"
        loading={togglingFlag}
        onConfirm={() => {
          if (confirmFlag != null) void toggleFlag(confirmFlag);
        }}
      />
    </div>
  );
}
