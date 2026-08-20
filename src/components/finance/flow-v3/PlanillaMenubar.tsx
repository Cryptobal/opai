"use client";

import { useEffect, useRef, useState } from "react";
import type { PlanillaDensity, PlanillaTheme } from "./usePlanillaViewPrefs";
import type { NumberFormatMode } from "./format";

type MenuKey = "archivo" | "editar" | "ver" | "formato" | "datos" | null;

interface Props {
  theme: PlanillaTheme;
  density: PlanillaDensity;
  freeze: boolean;
  showChips: boolean;
  showZeros: boolean;
  showArchived: boolean;
  numberFormat: NumberFormatMode;
  canManage: boolean;
  hasSelection: boolean;
  onExportXlsx: () => void;
  onExportCsv: () => void;
  onPrint: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onFillRight: () => void;
  onSearch: () => void;
  onTheme: (t: PlanillaTheme) => void;
  onFreeze: (v: boolean) => void;
  onChips: (v: boolean) => void;
  onZeros: () => void;
  onArchived: () => void;
  onDensity: (d: PlanillaDensity) => void;
  onFullscreen: () => void;
  onBold: () => void;
  onAlignH: (a: "left" | "center" | "right") => void;
  onAlignV: (a: "top" | "middle" | "bottom") => void;
  onNumberFormat: (m: NumberFormatMode) => void;
  onClearFormat: () => void;
  onCloseWeek: () => void;
  onExpand: () => void;
  onCollapse: () => void;
  onSortByAmount?: () => void;
  sortByAmountLabel?: string;
  /** Abre bandeja GAV; deshabilitado si no hay pendientes. */
  onClassifyEgresos?: () => void;
  egresosPendientesCount?: number;
  /** En modo panel el menubar de planilla no se renderiza. */
  chromeMode?: "full" | "panel";
}

const MENUS: { key: Exclude<MenuKey, null>; label: string }[] = [
  { key: "archivo", label: "Archivo" },
  { key: "editar", label: "Editar" },
  { key: "ver", label: "Ver" },
  { key: "formato", label: "Formato" },
  { key: "datos", label: "Datos" },
];

function Item({
  label, onClick, disabled, hint, danger,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={hint}
      onClick={onClick}
      className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] hover:bg-ds-surface-2 disabled:opacity-40 ${
        danger ? "text-status-danger-fg" : "text-ds-text-1"
      }`}
    >
      <span>{label}</span>
      {hint && <span className="ml-6 text-[12px] text-ds-text-4">{hint}</span>}
    </button>
  );
}

/** Barra de menús 32px (solo ≥lg). UF/UTM viven en el topbar global — no duplicar. */
export function PlanillaMenubar(p: Props) {
  const [open, setOpen] = useState<MenuKey>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || p.chromeMode === "panel") return;
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, p.chromeMode]);

  const close = (fn?: () => void) => () => { fn?.(); setOpen(null); };

  if (p.chromeMode === "panel") return null;

  return (
    <div
      ref={root}
      className="planilla-chrome-print-hide relative mb-0.5 hidden h-[var(--plnx-menubar-h)] items-center gap-1 px-1 text-ds-text-1 lg:flex"
      role="menubar"
      aria-label="Menú de la planilla"
    >
      <span className="mr-2 shrink-0 text-[13px] font-semibold text-ds-text-1">Planilla</span>
      {MENUS.map((m) => (
        <div key={m.key} className="relative">
          <button
            type="button"
            role="menuitem"
            aria-expanded={open === m.key}
            className={`h-7 rounded px-2 text-[13px] ${
              open === m.key ? "bg-ds-surface-2 text-ds-text-1" : "text-ds-text-2 hover:bg-ds-surface-2"
            }`}
            onClick={() => setOpen(open === m.key ? null : m.key)}
            onMouseEnter={() => { if (open) setOpen(m.key); }}
          >
            {m.label}
          </button>
          {open === m.key && (
            <div
              role="menu"
              className="absolute left-0 top-full z-50 min-w-[220px] rounded-md border border-ds-border-default bg-ds-surface-1 py-1 shadow-md"
            >
              {m.key === "archivo" && (
                <>
                  <Item label="Exportar Excel…" onClick={close(p.onExportXlsx)} />
                  <Item label="Exportar CSV…" onClick={close(p.onExportCsv)} />
                  <Item label="Imprimir…" onClick={close(p.onPrint)} hint="⌘P" />
                </>
              )}
              {m.key === "editar" && (
                <>
                  <Item label="Deshacer" onClick={close(p.onUndo)} hint="⌘Z" />
                  <Item label="Rehacer" onClick={close(p.onRedo)} hint="⌘⇧Z" />
                  <Item label="Copiar selección" onClick={close(p.onCopy)} hint="⌘C" disabled={!p.hasSelection} />
                  <Item label="Rellenar derecha" onClick={close(p.onFillRight)} hint="⌘D" disabled={!p.hasSelection} />
                  <Item label="Buscar…" onClick={close(p.onSearch)} hint="⌘F" />
                </>
              )}
              {m.key === "ver" && (
                <>
                  <Item
                    label={p.theme === "paper" ? "Hoja noche" : "Hoja papel"}
                    onClick={close(() => p.onTheme(p.theme === "paper" ? "dark" : "paper"))}
                  />
                  <Item
                    label={p.freeze ? "Desinmovilizar" : "Inmovilizar"}
                    onClick={close(() => p.onFreeze(!p.freeze))}
                  />
                  <Item
                    label={`Modo color (fondo)${p.showChips ? " ✓" : ""}`}
                    onClick={close(() => p.onChips(true))}
                  />
                  <Item
                    label={`Modo cuñas (marcas)${p.showChips ? "" : " ✓"}`}
                    onClick={close(() => p.onChips(false))}
                  />
                  <Item label={p.showZeros ? "Ocultar ceros" : "Mostrar ceros"} onClick={close(p.onZeros)} />
                  <Item
                    label={`Filas archivadas${p.showArchived ? " ✓" : ""}`}
                    onClick={close(p.onArchived)}
                  />
                  <div className="my-1 border-t border-ds-border-subtle" />
                  {([["compact", "Densidad compacta"], ["standard", "Densidad estándar"], ["comfortable", "Densidad cómoda"]] as const).map(([k, l]) => (
                    <Item
                      key={k}
                      label={`${l}${p.density === k ? " ✓" : ""}`}
                      onClick={close(() => p.onDensity(k))}
                    />
                  ))}
                  <div className="my-1 border-t border-ds-border-subtle" />
                  <Item label="Pantalla completa" onClick={close(p.onFullscreen)} />
                </>
              )}
              {m.key === "formato" && (
                <>
                  <Item label="Negrita" onClick={close(p.onBold)} hint="⌘B" disabled={!p.hasSelection} />
                  <Item label="Alinear izquierda" onClick={close(() => p.onAlignH("left"))} disabled={!p.hasSelection} />
                  <Item label="Alinear centro" onClick={close(() => p.onAlignH("center"))} disabled={!p.hasSelection} />
                  <Item label="Alinear derecha" onClick={close(() => p.onAlignH("right"))} disabled={!p.hasSelection} />
                  <Item label="Vertical superior" onClick={close(() => p.onAlignV("top"))} disabled={!p.hasSelection} />
                  <Item label="Vertical medio" onClick={close(() => p.onAlignV("middle"))} disabled={!p.hasSelection} />
                  <Item label="Vertical inferior" onClick={close(() => p.onAlignV("bottom"))} disabled={!p.hasSelection} />
                  <div className="my-1 border-t border-ds-border-subtle" />
                  {([["clp", "$ CLP"], ["m", "M$"], ["mm", "MM$"]] as const).map(([k, l]) => (
                    <Item
                      key={k}
                      label={`${l}${p.numberFormat === k ? " ✓" : ""}`}
                      onClick={close(() => p.onNumberFormat(k))}
                    />
                  ))}
                  <div className="my-1 border-t border-ds-border-subtle" />
                  <Item label="Borrar formato" onClick={close(p.onClearFormat)} disabled={!p.hasSelection} danger />
                </>
              )}
              {m.key === "datos" && (
                <>
                  <Item label="Cerrar semana…" onClick={close(p.onCloseWeek)} disabled={!p.canManage} />
                  {p.onClassifyEgresos && (
                    <Item
                      label="Clasificar egresos sin asignar…"
                      onClick={close(p.onClassifyEgresos)}
                      disabled={(p.egresosPendientesCount ?? 0) <= 0}
                      hint={
                        (p.egresosPendientesCount ?? 0) > 0
                          ? String(p.egresosPendientesCount)
                          : undefined
                      }
                    />
                  )}
                  <Item label="Expandir grupos" onClick={close(p.onExpand)} />
                  <Item label="Contraer grupos" onClick={close(p.onCollapse)} />
                  {p.onSortByAmount && (
                    <Item
                      label={p.sortByAmountLabel ?? "Ordenar por montos"}
                      onClick={close(p.onSortByAmount)}
                    />
                  )}
                  <Item label="Filtro…" disabled hint="próximamente" />
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
