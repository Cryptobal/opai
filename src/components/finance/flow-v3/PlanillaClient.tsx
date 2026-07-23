"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport";
import { usePlanillaMatrix } from "./usePlanillaMatrix";
import { usePlanillaActions } from "./usePlanillaActions";
import { PlanillaGrid, scrollToWeek } from "./PlanillaGrid";
import { AddRowDialog } from "./AddRowDialog";
import { fmtClp, fmtShortDate } from "./format";

const ZEROS_PREF_KEY = "opai-planilla-show-zeros";

/**
 * Modo Planilla v3. Una sola toolbar de una línea (sin hero ni KPI cards:
 * saldo/semana crítica van como texto compacto en desktop) y la hoja ocupando
 * todo el espacio restante. En mobile la ruta entra en "sheet focus" (ver
 * AppShell): topbar + hoja + bottom nav, nada más.
 */
export function PlanillaClient({ canManage, flagOn }: { canManage: boolean; flagOn: boolean }) {
  const router = useRouter();
  const isMobile = useIsMobileViewport();
  const m = usePlanillaMatrix();
  const actions = usePlanillaActions(m.refetch);
  const [addOpen, setAddOpen] = useState(false);
  const [archiving, setArchiving] = useState<FlowMatrixRowDto | null>(null);
  const [templateWarning, setTemplateWarning] = useState<string[] | null>(null);
  const [enabled, setEnabled] = useState(flagOn);
  const [togglingFlag, setTogglingFlag] = useState(false);
  const [confirmFlag, setConfirmFlag] = useState<null | boolean>(null);

  // Filtro de ceros: filas sin ninguna capa en el horizonte van ocultas por
  // defecto; preferencia persistida por dispositivo.
  const [showZeros, setShowZeros] = useState(false);
  useEffect(() => {
    try {
      setShowZeros(localStorage.getItem(ZEROS_PREF_KEY) === "true");
    } catch { /* ignore */ }
  }, []);
  const toggleZeros = () =>
    setShowZeros((v) => {
      try { localStorage.setItem(ZEROS_PREF_KEY, String(!v)); } catch { /* ignore */ }
      return !v;
    });

  // Filas creadas en esta sesión: exentas del filtro de ceros para que la
  // nueva línea aparezca aunque todavía no tenga montos.
  const sessionRowIds = useRef<Set<string>>(new Set());
  const handleCreateRow = async (body: Record<string, unknown>) => {
    const r = (await actions.createRow(body)) as { id?: string } | null;
    if (r?.id) sessionRowIds.current.add(r.id);
    return r;
  };

  // Navegación ‹/›/Hoy: scroll nativo dentro del horizonte cargado (4/8
  // columnas por paso). Solo al tocar un borde del horizonte se desplaza la
  // ventana (un fetch por bloque de 8 semanas, nunca por gesto).
  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollToCurrent = useRef(false);
  const nav = (dir: -1 | 1) => {
    const el = gridScrollRef.current;
    if (!el) return;
    const weekW = el.querySelector<HTMLElement>("[data-week]")?.offsetWidth ?? 86;
    const atLeft = el.scrollLeft <= 2;
    const atRight = el.scrollLeft >= el.scrollWidth - el.clientWidth - 2;
    if (dir === -1 && atLeft) {
      m.extendPast(); // scrollLeft se conserva → aparecen las 8 semanas previas
      return;
    }
    if (dir === 1 && atRight) {
      m.extendFuture();
      return;
    }
    el.scrollBy({ left: dir * (isMobile ? 4 : 8) * weekW, behavior: "smooth" });
  };
  const goToday = () => {
    const changed = m.resetWindow();
    if (changed) {
      pendingScrollToCurrent.current = true;
    } else if (gridScrollRef.current && m.data) {
      scrollToWeek(gridScrollRef.current, m.data.currentWeek);
    }
  };
  useEffect(() => {
    if (!pendingScrollToCurrent.current || !m.data || !gridScrollRef.current) return;
    pendingScrollToCurrent.current = false;
    scrollToWeek(gridScrollRef.current, m.data.currentWeek, false);
  }, [m.data]);

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
  const minTone = kpis
    ? kpis.minBalance < 0
      ? "text-status-danger-fg"
      : kpis.minBalance < (m.data?.warnThreshold ?? 0)
        ? "text-status-warn-fg"
        : "text-status-ok-fg"
    : "";
  const navBtn = "h-10 min-w-10 px-1.5 lg:h-7 lg:min-w-0 lg:px-1.5";
  const txtBtn = "h-10 px-2.5 text-xs lg:h-7 lg:px-2";

  return (
    <div className="planilla-sheet">
      {/* ── Toolbar única de una línea ── */}
      <div className="mb-1 flex h-[var(--plnx-toolbar-h)] items-center gap-1 overflow-x-auto scrollbar-none px-2 lg:px-0">
        <Button variant="outline" size="sm" className={navBtn} onClick={() => nav(-1)} aria-label="Semanas anteriores">
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" className={txtBtn} onClick={goToday}>
          Hoy
        </Button>
        <Button variant="outline" size="sm" className={navBtn} onClick={() => nav(1)} aria-label="Semanas siguientes">
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <div className="ml-0.5 flex h-10 shrink-0 overflow-hidden rounded-md border border-ds-border-default lg:h-7">
          {(["week", "month"] as const).map((g) => (
            <button
              key={g}
              onClick={() => m.setGranularity(g)}
              className={`px-2 text-xs ${m.granularity === g ? "bg-primary text-primary-foreground" : "bg-ds-surface-1 text-ds-text-3 hover:bg-ds-surface-2"}`}
            >
              <span className="lg:hidden">{g === "week" ? "Sem" : "Mes"}</span>
              <span className="hidden lg:inline">{g === "week" ? "Semanas" : "Meses"}</span>
            </button>
          ))}
        </div>
        <Button
          variant={showZeros ? "default" : "outline"}
          size="sm"
          className={`${txtBtn} ml-0.5`}
          onClick={toggleZeros}
          aria-pressed={showZeros}
          title={showZeros ? "Ocultar filas en cero" : "Mostrar filas en cero"}
        >
          Ceros
        </Button>
        {canManage && (
          <Button size="sm" className={`${navBtn} ml-0.5 lg:px-2`} onClick={() => setAddOpen(true)} aria-label="Agregar concepto">
            <Plus className="h-3.5 w-3.5" />
            <span className="ml-1 hidden lg:inline">Agregar concepto</span>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className={navBtn} aria-label="Más acciones">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {canManage && (
              <DropdownMenuItem disabled={togglingFlag} onSelect={() => setConfirmFlag(!enabled)}>
                <Power className="mr-1.5 h-3.5 w-3.5" />
                {enabled ? "Desactivar en navegación" : "Activar en navegación"}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => router.push("/finanzas/flujo-caja")}>
              Abrir versión anterior
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Saldo / semana crítica como texto compacto (desktop; en mobile la
            fila sticky de Saldo acumulado cumple ese rol). */}
        {kpis && (
          <div className="ml-auto hidden items-center gap-1.5 whitespace-nowrap font-mono text-[11px] uppercase tracking-wide text-ds-text-3 lg:flex">
            <span>
              Saldo <span className="text-ds-text-1">{fmtClp(kpis.saldoHoy)}</span>
            </span>
            <span aria-hidden>·</span>
            <span>
              Mín <span className={minTone}>{fmtClp(kpis.minBalance)}</span>{" "}
              <span className="text-ds-text-4">({fmtShortDate(kpis.minWeek)})</span>
            </span>
          </div>
        )}
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
            showZeros={showZeros}
            alwaysVisibleRowIds={sessionRowIds.current}
            scrollerRef={gridScrollRef}
          />
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center rounded-lg border border-ds-border-subtle text-sm text-status-danger-fg">
          No se pudo cargar la planilla.
        </div>
      )}

      <AddRowDialog open={addOpen} onOpenChange={setAddOpen} busy={actions.busy} onCreate={handleCreateRow} />

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
