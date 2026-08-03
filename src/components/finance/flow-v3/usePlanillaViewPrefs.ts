"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { NumberFormatMode } from "./format";

export type PlanillaTheme = "paper" | "dark";
export type PlanillaDensity = "compact" | "standard" | "comfortable";
export type AlignH = "left" | "center" | "right";
export type AlignV = "top" | "middle" | "bottom";

/** Paleta fija de rellenos (6) y colores de texto (4). */
export const FILL_PALETTE = [
  "#ffffff",
  "#fce8e6",
  "#fef7e0",
  "#e6f4ea",
  "#e8f0fe",
  "#f3e8fd",
] as const;

export const COLOR_PALETTE = [
  "#202124",
  "#cc0000",
  "#0b57d0",
  "#137333",
] as const;

export type FillColor = (typeof FILL_PALETTE)[number];
export type TextColor = (typeof COLOR_PALETTE)[number];

export interface CellStyle {
  bold?: boolean;
  align?: AlignH;
  valign?: AlignV;
  fill?: FillColor;
  color?: TextColor;
}

export type CellStylesMap = Record<string, CellStyle>;

export interface PlanillaViewPrefs {
  theme: PlanillaTheme;
  density: PlanillaDensity;
  zoom: number;
  showChips: boolean;
  numberFormat: NumberFormatMode;
  freeze: boolean;
  cellStyles: CellStylesMap;
}

const ZOOM_STEPS = [0.8, 0.9, 1, 1.15, 1.3] as const;
export { ZOOM_STEPS };

const DENSITY_ROW: Record<PlanillaDensity, string> = {
  compact: "17px",
  standard: "20px",
  comfortable: "24px",
};

/** Tema inicial según el shell (html.dark). Evita hoja papel blanca en app noche. */
function themeFromDocument(): PlanillaTheme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "paper";
}

const DEFAULTS: PlanillaViewPrefs = {
  theme: "dark", // se rehidrata con themeFromDocument / sync del shell
  density: "standard",
  zoom: 1,
  showChips: false,
  numberFormat: "clp",
  freeze: true,
  cellStyles: {},
};

function storageKey(tenantId: string): string {
  return `opai-planilla-prefs:${tenantId || "default"}`;
}

function isFill(v: unknown): v is FillColor {
  return typeof v === "string" && (FILL_PALETTE as readonly string[]).includes(v);
}
function isColor(v: unknown): v is TextColor {
  return typeof v === "string" && (COLOR_PALETTE as readonly string[]).includes(v);
}

function sanitize(raw: unknown): PlanillaViewPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULTS, cellStyles: {} };
  const o = raw as Record<string, unknown>;
  const theme: PlanillaTheme = o.theme === "dark" ? "dark" : "paper";
  const density: PlanillaDensity =
    o.density === "compact" || o.density === "comfortable" ? o.density : "standard";
  const zoom =
    typeof o.zoom === "number" && (ZOOM_STEPS as readonly number[]).includes(o.zoom)
      ? o.zoom
      : 1;
  const showChips = o.showChips === true;
  const numberFormat: NumberFormatMode =
    o.numberFormat === "m" || o.numberFormat === "mm" ? o.numberFormat : "clp";
  const freeze = o.freeze !== false;
  const cellStyles: CellStylesMap = {};
  if (o.cellStyles && typeof o.cellStyles === "object") {
    for (const [k, v] of Object.entries(o.cellStyles as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const s = v as Record<string, unknown>;
      const style: CellStyle = {};
      if (s.bold === true) style.bold = true;
      if (s.align === "left" || s.align === "center" || s.align === "right") style.align = s.align;
      if (s.valign === "top" || s.valign === "middle" || s.valign === "bottom") style.valign = s.valign;
      if (isFill(s.fill)) style.fill = s.fill;
      if (isColor(s.color)) style.color = s.color;
      if (Object.keys(style).length > 0) cellStyles[k] = style;
    }
  }
  return { theme, density, zoom, showChips, numberFormat, freeze, cellStyles };
}

export function cellStyleKey(rowId: string, weekStart: string): string {
  return `${rowId}:${weekStart}`;
}

/**
 * Preferencias de vista de la planilla (tema, densidad, zoom, chips, formato
 * numérico, estilos de celda). Persistidas en localStorage por tenant.
 * Valores corruptos → defaults. Sin datos sensibles.
 */
export function usePlanillaViewPrefs(tenantId: string) {
  const key = useMemo(() => storageKey(tenantId), [tenantId]);
  const [prefs, setPrefs] = useState<PlanillaViewPrefs>(() => ({
    ...DEFAULTS,
    cellStyles: {},
  }));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const saved = sanitize(JSON.parse(raw));
        // Si el shell está en noche y la pref guardada es papel, preferir
        // noche para no dejar la hoja blanca dentro del app oscuro.
        const shell = themeFromDocument();
        if (shell === "dark" && saved.theme === "paper") {
          setPrefs({ ...saved, theme: "dark" });
        } else {
          setPrefs(saved);
        }
      } else {
        setPrefs({ ...DEFAULTS, theme: themeFromDocument(), cellStyles: {} });
      }
    } catch {
      setPrefs({ ...DEFAULTS, theme: themeFromDocument(), cellStyles: {} });
    }
    setHydrated(true);
  }, [key]);

  /** Sincroniza la hoja con el tema del shell (solo scoped a .planilla-sheet). */
  const syncWithShellTheme = useCallback((appTheme: "light" | "dark") => {
    setPrefs((p) => {
      const next: PlanillaTheme = appTheme === "dark" ? "dark" : "paper";
      return p.theme === next ? p : { ...p, theme: next };
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify(prefs));
    } catch { /* quota / private mode */ }
  }, [key, prefs, hydrated]);

  const patch = useCallback((partial: Partial<PlanillaViewPrefs>) => {
    setPrefs((p) => ({ ...p, ...partial }));
  }, []);

  const setTheme = useCallback((theme: PlanillaTheme) => patch({ theme }), [patch]);
  const setDensity = useCallback((density: PlanillaDensity) => patch({ density }), [patch]);
  const setZoom = useCallback((zoom: number) => {
    const z = (ZOOM_STEPS as readonly number[]).includes(zoom) ? zoom : 1;
    patch({ zoom: z });
  }, [patch]);
  const setShowChips = useCallback((showChips: boolean) => patch({ showChips }), [patch]);
  const setNumberFormat = useCallback(
    (numberFormat: NumberFormatMode) => patch({ numberFormat }),
    [patch],
  );
  const setFreeze = useCallback((freeze: boolean) => patch({ freeze }), [patch]);

  const getCellStyle = useCallback(
    (rowId: string, weekStart: string): CellStyle | undefined =>
      prefs.cellStyles[cellStyleKey(rowId, weekStart)],
    [prefs.cellStyles],
  );

  const setCellStyle = useCallback(
    (rowId: string, weekStart: string, style: Partial<CellStyle> | null) => {
      setPrefs((p) => {
        const k = cellStyleKey(rowId, weekStart);
        const next = { ...p.cellStyles };
        if (style === null) {
          delete next[k];
        } else {
          const merged = { ...next[k], ...style };
          // Toggle bold: si llega bold:false, limpia la clave.
          if (merged.bold === false) delete merged.bold;
          if (Object.keys(merged).length === 0) delete next[k];
          else next[k] = merged as CellStyle;
        }
        return { ...p, cellStyles: next };
      });
    },
    [],
  );

  const clearCellStyle = useCallback(
    (rowId: string, weekStart: string) => setCellStyle(rowId, weekStart, null),
    [setCellStyle],
  );

  const toggleBold = useCallback(
    (rowId: string, weekStart: string) => {
      const cur = prefs.cellStyles[cellStyleKey(rowId, weekStart)];
      setCellStyle(rowId, weekStart, { bold: !cur?.bold });
    },
    [prefs.cellStyles, setCellStyle],
  );

  /** CSS vars + data-attrs para aplicar en el contenedor .planilla-sheet. */
  const containerStyle = useMemo(
    () =>
      ({
        "--plnx-row-h": DENSITY_ROW[prefs.density],
        "--plnx-section-h":
          prefs.density === "compact" ? "16px" : prefs.density === "comfortable" ? "22px" : "18px",
        "--plnx-zoom": String(prefs.zoom),
      }) as CSSProperties,
    [prefs.density, prefs.zoom],
  );

  return {
    prefs,
    hydrated,
    containerStyle,
    setTheme,
    syncWithShellTheme,
    setDensity,
    setZoom,
    setShowChips,
    setNumberFormat,
    setFreeze,
    getCellStyle,
    setCellStyle,
    clearCellStyle,
    toggleBold,
    densityRowPx: DENSITY_ROW[prefs.density],
  };
}

export type PlanillaViewPrefsApi = ReturnType<typeof usePlanillaViewPrefs>;
