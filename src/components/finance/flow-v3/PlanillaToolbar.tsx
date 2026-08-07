"use client";

import { useState, type ReactNode } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, Bold, ChevronLeft, ChevronRight,
  ChevronsDownUp, ChevronsUpDown, Download, Inbox, Info, Lock, MoreHorizontal,
  PaintBucket, Redo2, Search, Snowflake, Tags, Type, Undo2, ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { SegmentedControl } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { fmtClp, type NumberFormatMode } from "./format";
import {
  COLOR_PALETTE, FILL_PALETTE, ZOOM_STEPS,
  type AlignH, type AlignV, type PlanillaTheme,
} from "./usePlanillaViewPrefs";

const btn = "h-10 min-w-10 px-1.5 lg:h-7 lg:min-w-7 lg:px-1.5";
const txt = "h-10 px-2.5 text-xs lg:h-7 lg:px-2";
const icon = "h-3.5 w-3.5";
const sep = "mx-1 hidden h-5 w-px shrink-0 bg-ds-border-default lg:block";

interface Props {
  canManage: boolean;
  granularity: "week" | "month";
  showZeros: boolean;
  showChips: boolean;
  /** Preferencia: mostrar labels junto a iconos de la barra de contexto. */
  showToolbarLabels: boolean;
  onToggleToolbarLabels: () => void;
  theme: PlanillaTheme;
  zoom: number;
  numberFormat: NumberFormatMode;
  freeze: boolean;
  hasSelection: boolean;
  selectedBold: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onNav: (dir: -1 | 1) => void;
  onToday: () => void;
  onGranularity: (g: "week" | "month") => void;
  onToggleZeros: () => void;
  onToggleChips: () => void;
  onToggleTheme: () => void;
  onZoom: (z: number) => void;
  onNumberFormat: (m: NumberFormatMode) => void;
  onToggleBold: () => void;
  onAlignH: (a: AlignH) => void;
  onAlignV: (a: AlignV) => void;
  /** `null` = Sin relleno / Automático (elimina la propiedad). */
  onFill: (hex: string | null) => void;
  onColor: (hex: string | null) => void;
  searchOpen?: boolean;
  onToggleFreeze: () => void;
  onExpandGroups: () => void;
  onCollapseGroups: () => void;
  onSearch: () => void;
  onExportXlsx: () => void;
  onExportCsv: () => void;
  onPrint: () => void;
  onCloseWeek: () => void;
  onLegend: () => void;
  /** Movimientos REAL pendientes en bandeja GAV. */
  egresosPendientesCount?: number;
  /** Abre la bandeja de egresos (GAV). */
  onClassifyEgresos?: () => void;
  /** Saldo banco hoy (al lado de clasificar). */
  saldoHoy?: number | null;
  bankStale?: boolean;
  onOpenBank?: () => void;
  /** Modo Σ: selección discontinua. */
  sumMode?: boolean;
  onToggleSumMode?: () => void;
  /** Facturas en mora visibles en el horizonte cargado. */
  moraCount?: number;
  moraFilter?: boolean;
  onToggleMoraFilter?: () => void;
  /** Facturas cedidas (factoring) en el horizonte cargado. */
  cededCount?: number;
  cededFilter?: boolean;
  onToggleCededFilter?: () => void;
  viewTab?: "planilla" | "panel";
  onViewTab?: (tab: "planilla" | "panel") => void;
}

function ColorSwatch({
  color, onPick, label,
}: {
  color: string | null;
  onPick: () => void;
  label: string;
}) {
  return (
    <DropdownMenuItem
      className="h-7 w-7 cursor-pointer rounded-sm p-0"
      onSelect={onPick}
      aria-label={label}
      title={label}
    >
      {color == null ? (
        <span
          className="relative h-6 w-6 rounded-sm border border-ds-border-default bg-ds-surface-1"
          aria-hidden
        >
          <span className="absolute inset-0 block origin-center rotate-45 border-t border-status-danger" />
        </span>
      ) : (
        <span
          className="h-6 w-6 rounded-sm border border-ds-border-default"
          style={{ backgroundColor: color }}
        />
      )}
    </DropdownMenuItem>
  );
}

function Tip({
  label, children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Chrome de planilla en 2 capas:
 * 1) Contexto (nav, granularidad, vista, acciones frecuentes, overflow)
 * 2) Edición (solo desktop: formato / zoom / búsqueda)
 * Densidad por defecto tipo móvil (solo iconos); labels opcionales vía preferencia.
 */
export function PlanillaToolbar(p: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const egresosPendientes = p.egresosPendientesCount ?? 0;
  const moraCount = p.moraCount ?? 0;
  const cededCount = p.cededCount ?? 0;
  const classifyDisabled = egresosPendientes <= 0 || !p.onClassifyEgresos;
  const labels = p.showToolbarLabels;

  const needSel = (fn: () => void) => {
    if (!p.hasSelection) {
      toast.message("Selecciona una celda primero");
      return;
    }
    fn();
  };

  const closeMore = (fn?: () => void) => () => {
    fn?.();
    setMoreOpen(false);
  };

  const classifyLabel =
    egresosPendientes > 0
      ? `Clasificar egresos · ${egresosPendientes} sin clasificar`
      : "Clasificar egresos · no hay pendientes";

  const classifyButton = (
    <Button
      variant="outline"
      size="sm"
      className={`${btn} shrink-0 ${labels ? "sm:px-2.5" : ""}`}
      onClick={p.onClassifyEgresos}
      disabled={classifyDisabled}
      aria-label={classifyLabel}
    >
      <Inbox className={icon} />
      {labels && <span className="ml-1">Clasificar</span>}
      {egresosPendientes > 0 && (
        <span className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-status-warn-soft px-1.5 text-[12px] font-medium tabular-nums text-status-warn-fg">
          {egresosPendientes}
        </span>
      )}
    </Button>
  );

  const chipsLabel = p.showChips ? "Ocultar chips" : "Mostrar chips";
  const closeWeekLabel = "Cerrar semana";
  const legendLabel = "Leyenda de colores";

  return (
    <div className="planilla-chrome-print-hide mb-1 flex flex-col gap-1 text-ds-text-1">
      {/* ── Fila contexto ── */}
      <TooltipProvider delayDuration={200}>
        <div
          className="flex h-11 items-center gap-1 overflow-x-auto rounded-2xl border border-ds-border-default bg-ds-surface-2 px-1.5 scrollbar-none lg:h-9 lg:gap-1.5 lg:overflow-visible lg:rounded-full lg:px-2"
          role="toolbar"
          aria-label="Contexto de la planilla"
        >
          <div className="flex shrink-0 items-center gap-0.5">
            <Tip label="Semanas anteriores">
              <Button
                variant="ghost"
                size="sm"
                className={btn}
                onClick={() => p.onNav(-1)}
                aria-label="Semanas anteriores"
              >
                <ChevronLeft className={icon} />
              </Button>
            </Tip>
            <Button variant="outline" size="sm" className={txt} onClick={p.onToday}>
              Hoy
            </Button>
            <Tip label="Semanas siguientes">
              <Button
                variant="ghost"
                size="sm"
                className={btn}
                onClick={() => p.onNav(1)}
                aria-label="Semanas siguientes"
              >
                <ChevronRight className={icon} />
              </Button>
            </Tip>
          </div>

          <span className={sep} aria-hidden />

          {/* Labels cortos en móvil / densos; largos en desktop con labels on */}
          <div className="shrink-0 lg:hidden">
            <SegmentedControl
              size="xs"
              ariaLabel="Granularidad"
              value={p.granularity}
              onChange={p.onGranularity}
              items={[
                { id: "week", label: "Sem" },
                { id: "month", label: "Mes" },
              ]}
            />
          </div>
          <div className="hidden shrink-0 lg:block">
            <SegmentedControl
              size="xs"
              ariaLabel="Granularidad"
              value={p.granularity}
              onChange={p.onGranularity}
              items={[
                { id: "week", label: labels ? "Semanas" : "Sem" },
                { id: "month", label: labels ? "Meses" : "Mes" },
              ]}
            />
          </div>

          {p.onViewTab && (
            <>
              <span className={sep} aria-hidden />
              <SegmentedControl
                size="xs"
                ariaLabel="Vista"
                className="shrink-0"
                value={p.viewTab ?? "planilla"}
                onChange={p.onViewTab}
                items={[
                  { id: "planilla", label: "Planilla" },
                  { id: "panel", label: "Panel" },
                ]}
              />
            </>
          )}

          <span className={sep} aria-hidden />

          {p.onToggleMoraFilter && moraCount > 0 && (
            <Button
              variant={p.moraFilter ? "default" : "outline"}
              size="sm"
              className={`${btn} shrink-0 sm:px-2.5`}
              onClick={p.onToggleMoraFilter}
              aria-pressed={!!p.moraFilter}
              aria-label={
                p.moraFilter
                  ? `Mostrando solo mora · ${moraCount} factura${moraCount === 1 ? "" : "s"}`
                  : `Filtrar mora · ${moraCount} factura${moraCount === 1 ? "" : "s"}`
              }
            >
              <span className="text-[12px] font-medium uppercase tracking-wide">Mora</span>
              <span className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-status-warn-soft px-1.5 text-[12px] font-medium tabular-nums text-status-warn-fg">
                {moraCount}
              </span>
            </Button>
          )}

          {p.onToggleCededFilter && cededCount > 0 && (
            <Button
              variant={p.cededFilter ? "default" : "outline"}
              size="sm"
              className={`${btn} shrink-0 sm:px-2.5`}
              onClick={p.onToggleCededFilter}
              aria-pressed={!!p.cededFilter}
              aria-label={
                p.cededFilter
                  ? `Mostrando solo cedidas · ${cededCount} factura${cededCount === 1 ? "" : "s"}`
                  : `Filtrar cedidas · ${cededCount} factura${cededCount === 1 ? "" : "s"}`
              }
            >
              <span className="text-[12px] font-medium uppercase tracking-wide">Cedidas</span>
              <span className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-status-info-soft px-1.5 text-[12px] font-medium tabular-nums text-status-info-fg">
                {cededCount}
              </span>
            </Button>
          )}

          <div className="flex shrink-0 items-center gap-0.5">
            <Tip label="Expandir grupos">
              <Button
                variant="ghost"
                size="sm"
                className={btn}
                onClick={p.onExpandGroups}
                aria-label="Expandir grupos"
              >
                <ChevronsUpDown className={icon} />
                {labels && <span className="ml-1 hidden sm:inline">Expandir</span>}
              </Button>
            </Tip>
            <Tip label="Contraer grupos">
              <Button
                variant="ghost"
                size="sm"
                className={btn}
                onClick={p.onCollapseGroups}
                aria-label="Contraer grupos"
              >
                <ChevronsDownUp className={icon} />
                {labels && <span className="ml-1 hidden sm:inline">Contraer</span>}
              </Button>
            </Tip>
          </div>

          <div className="min-w-1 flex-1" />

          {p.onClassifyEgresos && (
            classifyDisabled ? (
              <Tip label="No hay egresos sin clasificar">
                <span className="inline-flex shrink-0">{classifyButton}</span>
              </Tip>
            ) : (
              <Tip label={classifyLabel}>
                <span className="inline-flex shrink-0">{classifyButton}</span>
              </Tip>
            )
          )}

          {p.saldoHoy != null && p.onOpenBank && (
            <Tip
              label={
                p.bankStale
                  ? "Última cartola hace más de 7 días — el saldo puede estar desactualizado"
                  : "Ver desglose por cuenta"
              }
            >
              <Button
                variant="ghost"
                size="sm"
                className={`${txt} shrink-0 text-ds-text-2`}
                onClick={p.onOpenBank}
                aria-label={`Banco hoy ${fmtClp(p.saldoHoy)}`}
              >
                <span className="hidden sm:inline">Banco hoy </span>
                <span
                  className={`tabular-nums ${
                    p.bankStale ? "text-status-warn-fg" : "text-ds-text-1"
                  }`}
                >
                  {fmtClp(p.saldoHoy)}
                </span>
              </Button>
            </Tip>
          )}

          <Tip label={chipsLabel}>
            <Button
              variant={p.showChips ? "default" : "outline"}
              size="sm"
              className={`${btn} shrink-0 ${labels ? "sm:px-2.5" : ""}`}
              onClick={p.onToggleChips}
              aria-label={chipsLabel}
              aria-pressed={p.showChips}
            >
              <Tags className={icon} />
              {labels && <span className="ml-1">Chips</span>}
            </Button>
          </Tip>

          {p.canManage && (
            <Tip label={closeWeekLabel}>
              <Button
                variant="outline"
                size="sm"
                className={`${btn} shrink-0 ${labels ? "sm:px-2.5" : ""}`}
                onClick={p.onCloseWeek}
                aria-label={closeWeekLabel}
              >
                <Lock className={icon} />
                {labels && <span className="ml-1">Cerrar</span>}
              </Button>
            </Tip>
          )}

          <Tip label={legendLabel}>
            <Button
              variant="outline"
              size="sm"
              className={`${btn} shrink-0 ${labels ? "sm:px-2.5" : ""}`}
              onClick={p.onLegend}
              aria-label={legendLabel}
            >
              <Info className={icon} />
              {labels && <span className="ml-1">Leyenda</span>}
            </Button>
          </Tip>

          {/* Desktop: menú overflow */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={`${btn} hidden lg:inline-flex ${labels ? "lg:px-2.5" : ""}`}
                aria-label="Más herramientas"
                title="Más herramientas"
              >
                <MoreHorizontal className={icon} />
                {labels && <span className="ml-1 text-xs">Más</span>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              <DropdownMenuItem onSelect={p.onToggleToolbarLabels}>
                {labels ? "Ocultar textos de barra" : "Mostrar textos de barra"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={p.onToggleZeros}>
                {p.showZeros ? "Ocultar ceros" : "Mostrar ceros"}
              </DropdownMenuItem>
              {p.onToggleSumMode && (
                <DropdownMenuItem onSelect={p.onToggleSumMode}>
                  {p.sumMode ? "Salir de modo Σ" : "Modo Σ (suma)"}
                </DropdownMenuItem>
              )}
              {p.onToggleMoraFilter && moraCount > 0 && (
                <DropdownMenuItem onSelect={p.onToggleMoraFilter}>
                  {p.moraFilter ? "Mostrar todas las filas" : `Solo mora (${moraCount})`}
                </DropdownMenuItem>
              )}
              {p.onToggleCededFilter && cededCount > 0 && (
                <DropdownMenuItem onSelect={p.onToggleCededFilter}>
                  {p.cededFilter ? "Mostrar todas las filas" : `Solo cedidas (${cededCount})`}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={p.onToggleTheme}>
                {p.theme === "paper" ? "Hoja noche" : "Hoja papel"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={p.onToggleFreeze}>
                {p.freeze ? "Desinmovilizar" : "Inmovilizar columnas"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={p.onExportXlsx}>Exportar Excel…</DropdownMenuItem>
              <DropdownMenuItem onSelect={p.onExportCsv}>Exportar CSV…</DropdownMenuItem>
              <DropdownMenuItem onSelect={p.onPrint}>Imprimir…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Móvil: sheet overflow */}
          <Tip label="Más herramientas">
            <Button
              variant="outline"
              size="sm"
              className={`${btn} lg:hidden`}
              onClick={() => setMoreOpen(true)}
              aria-label="Más herramientas"
            >
              <MoreHorizontal className={icon} />
            </Button>
          </Tip>
        </div>
      </TooltipProvider>

      {/* ── Fila edición (solo desktop) ── */}
      <div
        className="hidden h-8 items-center gap-0.5 rounded-full border border-ds-border-subtle bg-ds-surface-1 px-2 lg:flex"
        role="toolbar"
        aria-label="Formato de celda"
      >
        <Button variant="ghost" size="sm" className={btn} onClick={p.onUndo} aria-label="Deshacer" title="Deshacer (⌘Z)">
          <Undo2 className={icon} />
        </Button>
        <Button variant="ghost" size="sm" className={btn} onClick={p.onRedo} aria-label="Rehacer" title="Rehacer (⌘⇧Z)">
          <Redo2 className={icon} />
        </Button>

        <span className={sep} aria-hidden />

        <Button
          variant={p.selectedBold ? "default" : "ghost"}
          size="sm"
          className={btn}
          onClick={() => needSel(p.onToggleBold)}
          aria-label="Negrita"
          title="Negrita (⌘B)"
        >
          <Bold className={icon} />
        </Button>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className={btn} aria-label="Color de texto" title="Color de texto">
              <Type className={icon} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="flex gap-1 p-2">
            <ColorSwatch color={null} label="Automático" onPick={() => needSel(() => p.onColor(null))} />
            {COLOR_PALETTE.map((c) => (
              <ColorSwatch key={c} color={c} label={`Color ${c}`} onPick={() => needSel(() => p.onColor(c))} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className={btn} aria-label="Relleno" title="Relleno">
              <PaintBucket className={icon} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="flex gap-1 p-2">
            <ColorSwatch color={null} label="Sin relleno" onPick={() => needSel(() => p.onFill(null))} />
            {FILL_PALETTE.map((c) => (
              <ColorSwatch key={c} color={c} label={`Relleno ${c}`} onPick={() => needSel(() => p.onFill(c))} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([a, Icon]) => (
          <Button
            key={a}
            variant="ghost"
            size="sm"
            className={btn}
            onClick={() => needSel(() => p.onAlignH(a as AlignH))}
            aria-label={`Alinear ${a}`}
            title={`Alinear ${a}`}
          >
            <Icon className={icon} />
          </Button>
        ))}

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className={txt} aria-label="Alineación vertical" title="Alineación vertical">
              V
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {([["top", "Superior"], ["middle", "Medio"], ["bottom", "Inferior"]] as const).map(([k, l]) => (
              <DropdownMenuItem key={k} onSelect={() => needSel(() => p.onAlignV(k as AlignV))}>{l}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className={sep} aria-hidden />

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className={`${txt} gap-1`} aria-label="Zoom" title="Zoom">
              <ZoomIn className={icon} />
              <span>{Math.round(p.zoom * 100)}%</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {ZOOM_STEPS.map((z) => (
              <DropdownMenuItem key={z} onSelect={() => p.onZoom(z)}>
                {Math.round(z * 100)}%{z === p.zoom ? " ✓" : ""}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className={txt} aria-label="Formato número" title="Formato de número">
              {p.numberFormat === "clp" ? "$ CLP" : p.numberFormat === "m" ? "M$" : "MM$"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {([["clp", "$ CLP"], ["m", "M$ (miles)"], ["mm", "MM$ (millones)"]] as const).map(([k, l]) => (
              <DropdownMenuItem key={k} onSelect={() => p.onNumberFormat(k)}>{l}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className={sep} aria-hidden />

        <Button
          variant={p.freeze ? "default" : "ghost"}
          size="sm"
          className={btn}
          onClick={p.onToggleFreeze}
          aria-label="Inmovilizar"
          title="Inmovilizar columnas"
          aria-pressed={p.freeze}
        >
          <Snowflake className={icon} />
        </Button>
        <Button
          variant={p.searchOpen ? "default" : "ghost"}
          size="sm"
          className={btn}
          onClick={p.onSearch}
          aria-label="Buscar"
          title="Buscar (⌘F)"
          aria-pressed={!!p.searchOpen}
        >
          <Search className={icon} />
        </Button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className={btn} aria-label="Exportar" title="Exportar">
              <Download className={icon} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => p.onExportXlsx()}>Excel (.xlsx)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => p.onExportCsv()}>CSV</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => p.onPrint()}>Imprimir</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Sheet móvil: herramientas secundarias */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl px-4 pb-8 pt-4">
          <SheetHeader className="mb-3 text-left">
            <SheetTitle className="font-display text-base">Más herramientas</SheetTitle>
          </SheetHeader>

          <div className="space-y-4">
            <section>
              <p className="mb-2 text-ds-caption font-medium uppercase tracking-wide text-ds-text-3">Barra</p>
              <div className="grid grid-cols-2 gap-2">
                <SheetAction
                  label={labels ? "Ocultar textos" : "Mostrar textos"}
                  onClick={closeMore(p.onToggleToolbarLabels)}
                  active={labels}
                />
              </div>
            </section>

            <section>
              <p className="mb-2 text-ds-caption font-medium uppercase tracking-wide text-ds-text-3">Edición</p>
              <div className="grid grid-cols-3 gap-2">
                <SheetAction label="Deshacer" onClick={closeMore(p.onUndo)} icon={<Undo2 className="h-4 w-4" />} />
                <SheetAction label="Rehacer" onClick={closeMore(p.onRedo)} icon={<Redo2 className="h-4 w-4" />} />
                <SheetAction
                  label="Negrita"
                  onClick={closeMore(() => needSel(p.onToggleBold))}
                  icon={<Bold className="h-4 w-4" />}
                  active={p.selectedBold}
                />
                <SheetAction label="Buscar" onClick={closeMore(p.onSearch)} icon={<Search className="h-4 w-4" />} active={!!p.searchOpen} />
                {p.onToggleSumMode && (
                  <SheetAction
                    label="Modo Σ"
                    onClick={closeMore(p.onToggleSumMode)}
                    icon={<span className="text-sm font-display">Σ</span>}
                    active={!!p.sumMode}
                  />
                )}
                {p.onToggleMoraFilter && moraCount > 0 && (
                  <SheetAction
                    label={p.moraFilter ? "Todas las filas" : `Solo mora (${moraCount})`}
                    onClick={closeMore(p.onToggleMoraFilter)}
                    active={!!p.moraFilter}
                  />
                )}
                {p.onToggleCededFilter && cededCount > 0 && (
                  <SheetAction
                    label={p.cededFilter ? "Todas las filas" : `Solo cedidas (${cededCount})`}
                    onClick={closeMore(p.onToggleCededFilter)}
                    active={!!p.cededFilter}
                  />
                )}
              </div>
            </section>

            <section>
              <p className="mb-2 text-ds-caption font-medium uppercase tracking-wide text-ds-text-3">Vista</p>
              <div className="grid grid-cols-2 gap-2">
                <SheetAction
                  label={p.showZeros ? "Ocultar ceros" : "Mostrar ceros"}
                  onClick={closeMore(p.onToggleZeros)}
                  active={p.showZeros}
                />
                <SheetAction
                  label={p.theme === "paper" ? "Hoja noche" : "Hoja papel"}
                  onClick={closeMore(p.onToggleTheme)}
                />
                <SheetAction
                  label={p.freeze ? "Desinmovilizar" : "Inmovilizar"}
                  onClick={closeMore(p.onToggleFreeze)}
                  icon={<Snowflake className="h-4 w-4" />}
                  active={p.freeze}
                />
              </div>
            </section>

            <section>
              <p className="mb-2 text-ds-caption font-medium uppercase tracking-wide text-ds-text-3">Formato número</p>
              <div className="flex gap-2">
                {([["clp", "$ CLP"], ["m", "M$"], ["mm", "MM$"]] as const).map(([k, l]) => (
                  <SheetAction
                    key={k}
                    label={l}
                    onClick={closeMore(() => p.onNumberFormat(k))}
                    active={p.numberFormat === k}
                  />
                ))}
              </div>
            </section>

            <section>
              <p className="mb-2 text-ds-caption font-medium uppercase tracking-wide text-ds-text-3">Datos</p>
              <div className="grid grid-cols-2 gap-2">
                <SheetAction label="Excel" onClick={closeMore(p.onExportXlsx)} icon={<Download className="h-4 w-4" />} />
                <SheetAction label="CSV" onClick={closeMore(p.onExportCsv)} icon={<Download className="h-4 w-4" />} />
              </div>
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SheetAction({
  label, onClick, icon, active,
}: {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-ds-body transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-ds-border-default bg-ds-surface-1 text-ds-text-1 hover:bg-ds-surface-2"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
