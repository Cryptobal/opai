"use client";

import {
  AlignCenter, AlignLeft, AlignRight, Bold, ChevronLeft, ChevronRight,
  ChevronsDownUp, ChevronsUpDown, Download, Info, Lock, PaintBucket,
  Plus, Redo2, Search, Snowflake, Type, Undo2, ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NumberFormatMode } from "./format";
import {
  COLOR_PALETTE, FILL_PALETTE, ZOOM_STEPS,
  type AlignH, type AlignV, type PlanillaTheme,
} from "./usePlanillaViewPrefs";

const btn = "h-10 min-w-10 px-1.5 lg:h-7 lg:min-w-7 lg:px-1.5";
const txt = "h-10 px-2.5 text-xs lg:h-7 lg:px-2";
const icon = "h-3.5 w-3.5";

interface Props {
  canManage: boolean;
  granularity: "week" | "month";
  showZeros: boolean;
  showChips: boolean;
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
  onAdd: () => void;
  onCloseWeek: () => void;
  onLegend: () => void;
}

/** Toolbar píldora estilo Sheets: comandos de vista/formato + controles operativos. */
export function PlanillaToolbar(p: Props) {
  const needSel = (fn: () => void) => {
    if (!p.hasSelection) {
      toast.message("Selecciona una celda primero");
      return;
    }
    fn();
  };

  return (
    <div className="planilla-chrome-print-hide mb-1 flex h-[var(--plnx-toolbar-h)] items-center gap-0.5 overflow-x-auto scrollbar-none rounded-full border border-ds-border-default bg-ds-surface-2 px-1.5 text-ds-text-1 lg:px-2">
      {/* Desktop: undo/redo + export + zoom + formato */}
      <div className="hidden items-center gap-0.5 lg:flex">
        <Button variant="ghost" size="sm" className={btn} onClick={p.onUndo} aria-label="Deshacer" title="Deshacer (⌘Z)">
          <Undo2 className={icon} />
        </Button>
        <Button variant="ghost" size="sm" className={btn} onClick={p.onRedo} aria-label="Rehacer" title="Rehacer (⌘⇧Z)">
          <Redo2 className={icon} />
        </Button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className={btn} aria-label="Exportar" title="Exportar">
              <Download className={icon} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => p.onExportXlsx()}>Excel (.xlsx)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => p.onExportCsv()}>CSV</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => p.onPrint()}>Imprimir</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
            <DropdownMenuItem
              className="h-7 w-7 cursor-pointer rounded-sm p-0"
              onSelect={() => needSel(() => p.onColor(null))}
              aria-label="Automático"
              title="Automático"
            >
              <span
                className="relative h-6 w-6 rounded-sm border border-ds-border-default bg-ds-surface-1"
                aria-hidden
              >
                <span className="absolute inset-0 block origin-center rotate-45 border-t border-status-danger" />
              </span>
            </DropdownMenuItem>
            {COLOR_PALETTE.map((c) => (
              <DropdownMenuItem
                key={c}
                className="h-7 w-7 cursor-pointer rounded-sm p-0"
                onSelect={() => needSel(() => p.onColor(c))}
                aria-label={`Color ${c}`}
              >
                <span className="h-6 w-6 rounded-sm border border-ds-border-default" style={{ backgroundColor: c }} />
              </DropdownMenuItem>
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
            <DropdownMenuItem
              className="h-7 w-7 cursor-pointer rounded-sm p-0"
              onSelect={() => needSel(() => p.onFill(null))}
              aria-label="Sin relleno"
              title="Sin relleno"
            >
              <span
                className="relative h-6 w-6 rounded-sm border border-ds-border-default bg-ds-surface-1"
                aria-hidden
              >
                <span className="absolute inset-0 block origin-center rotate-45 border-t border-status-danger" />
              </span>
            </DropdownMenuItem>
            {FILL_PALETTE.map((c) => (
              <DropdownMenuItem
                key={c}
                className="h-7 w-7 cursor-pointer rounded-sm p-0"
                onSelect={() => needSel(() => p.onFill(c))}
                aria-label={`Relleno ${c}`}
              >
                <span className="h-6 w-6 rounded-sm border border-ds-border-default" style={{ backgroundColor: c }} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center">
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
        </div>
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
        <Button variant="ghost" size="sm" className={btn} onClick={p.onExpandGroups} aria-label="Expandir grupos" title="Expandir grupos">
          <ChevronsUpDown className={icon} />
        </Button>
        <Button variant="ghost" size="sm" className={btn} onClick={p.onCollapseGroups} aria-label="Contraer grupos" title="Contraer grupos">
          <ChevronsDownUp className={icon} />
        </Button>
        <Button variant="ghost" size="sm" className={btn} onClick={p.onSearch} aria-label="Buscar" title="Buscar (⌘F)">
          <Search className={icon} />
        </Button>
        <div className="mx-1 h-5 w-px bg-ds-border-default" aria-hidden />
      </div>

      {/* Controles operativos (desktop + móvil) */}
      <Button variant="outline" size="sm" className={btn} onClick={() => p.onNav(-1)} aria-label="Semanas anteriores">
        <ChevronLeft className={icon} />
      </Button>
      <Button variant="outline" size="sm" className={txt} onClick={p.onToday}>Hoy</Button>
      <Button variant="outline" size="sm" className={btn} onClick={() => p.onNav(1)} aria-label="Semanas siguientes">
        <ChevronRight className={icon} />
      </Button>
      <div className="ml-0.5 flex h-10 shrink-0 overflow-hidden rounded-md border border-ds-border-default lg:h-7">
        {(["week", "month"] as const).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => p.onGranularity(g)}
            className={`px-2 text-xs ${p.granularity === g ? "bg-primary text-primary-foreground" : "bg-ds-surface-1 text-ds-text-3 hover:bg-ds-surface-2"}`}
          >
            <span className="lg:hidden">{g === "week" ? "Sem" : "Mes"}</span>
            <span className="hidden lg:inline">{g === "week" ? "Semanas" : "Meses"}</span>
          </button>
        ))}
      </div>
      <Button
        variant={p.showZeros ? "default" : "outline"}
        size="sm"
        className={`${txt} ml-0.5`}
        onClick={p.onToggleZeros}
        aria-pressed={p.showZeros}
        title={p.showZeros ? "Ocultar filas en cero" : "Mostrar filas en cero"}
      >
        Ceros
      </Button>
      <Button
        variant={p.showChips ? "default" : "outline"}
        size="sm"
        className={`${txt} ml-0.5`}
        onClick={p.onToggleChips}
        aria-pressed={p.showChips}
        title={p.showChips ? "Ocultar chips de texto" : "Mostrar chips de texto"}
      >
        Chips
      </Button>
      {p.canManage && (
        <Button size="sm" className={`${btn} ml-0.5 lg:px-2`} onClick={p.onAdd} aria-label="Agregar concepto">
          <Plus className={icon} />
          <span className="ml-1 hidden lg:inline">Agregar concepto</span>
        </Button>
      )}
      {p.canManage && (
        <Button variant="outline" size="sm" className={`${txt} ml-0.5`} onClick={p.onCloseWeek} title="Cerrar la semana contra el saldo del banco">
          <Lock className={`${icon} lg:mr-1`} />
          <span className="hidden lg:inline">Cerrar semana</span>
        </Button>
      )}
      <Button variant="outline" size="sm" className={btn} onClick={p.onLegend} aria-label="Qué significan los colores" title="Qué significan los colores">
        <Info className={icon} />
      </Button>
      <Button
        variant="outline"
        size="sm"
        className={`${txt} ml-0.5`}
        onClick={p.onToggleTheme}
        aria-pressed={p.theme === "dark"}
        title={p.theme === "paper" ? "Hoja oscura" : "Hoja papel"}
      >
        {p.theme === "paper" ? "Noche" : "Papel"}
      </Button>
    </div>
  );
}
