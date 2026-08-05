"use client";

import { useEffect, useRef } from "react";
import type { CellHoverCardHandle, CellHoverShowCtx } from "./CellHoverCard";
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";

export interface HoverResolveResult {
  row: FlowMatrixRowDto;
  cell: FlowMatrixCellDto;
  colIdx: number;
  rowNumber: number;
  isPast: boolean;
  reason?: string;
}

/** Desktop con puntero fino (≥ lg): ficha anclada al clic. Móvil usa sheet. */
export function isDesktopCellDetail(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    window.matchMedia("(min-width: 1024px)").matches
  );
}

/** Abre la ficha anclada (clic izquierdo). Cierra con Esc / clic fuera / scroll. */
export function showPinnedCellDetail(
  hover: CellHoverCardHandle | null | undefined,
  ctx: CellHoverShowCtx,
  rect: DOMRect,
): void {
  if (!hover) return;
  hover.show(ctx, rect);
  hover.pin();
}

/**
 * Cierre por clic fuera / scroll + resalte cruzado ligero al pasar el puntero
 * (sin abrir la ficha: eso es solo con clic).
 */
export function useCellHover(opts: {
  scrollerRef: React.RefObject<HTMLElement | null>;
  hoverRef: React.RefObject<CellHoverCardHandle | null>;
  resolve: (rowId: string, colIdx: number) => HoverResolveResult | null;
  /** true → no resaltar ni interferir (edición, drag, Σ, menú, etc.). */
  isSuppressed: () => boolean;
}) {
  const resolveRef = useRef(opts.resolve);
  const suppressedRef = useRef(opts.isSuppressed);
  resolveRef.current = opts.resolve;
  suppressedRef.current = opts.isSuppressed;

  useEffect(() => {
    const root = opts.scrollerRef.current;
    const hover = opts.hoverRef;
    if (!root) return;

    let hlCol = -1;
    let hlRow: string | null = null;
    let fineHover = false;

    const mqHover = window.matchMedia("(hover: hover) and (pointer: fine)");
    const mqDesktop = window.matchMedia("(min-width: 1024px)");
    const syncMq = () => { fineHover = mqHover.matches && mqDesktop.matches; };
    syncMq();
    mqHover.addEventListener("change", syncMq);
    mqDesktop.addEventListener("change", syncMq);

    const clearHl = () => {
      if (hlCol >= 0) {
        root.querySelectorAll(`thead th[data-ci="${hlCol}"]`).forEach((el) => {
          el.classList.remove("plnx-hl");
        });
        hlCol = -1;
      }
      if (hlRow) {
        root.querySelector(`td[data-gutter-row="${hlRow}"]`)?.classList.remove("plnx-hl");
        hlRow = null;
      }
    };

    const applyHl = (rowId: string, colIdx: number) => {
      if (hlCol === colIdx && hlRow === rowId) return;
      clearHl();
      root.querySelectorAll(`thead th[data-ci="${colIdx}"]`).forEach((el) => {
        el.classList.add("plnx-hl");
      });
      root.querySelector(`td[data-gutter-row="${rowId}"]`)?.classList.add("plnx-hl");
      hlCol = colIdx;
      hlRow = rowId;
    };

    const parseRc = (el: Element | null): { rowId: string; colIdx: number } | null => {
      const td = el?.closest?.("td[data-rc]") as HTMLElement | null;
      if (!td) return null;
      const rc = td.getAttribute("data-rc");
      if (!rc) return null;
      const [rowId, colStr] = rc.split(":");
      const colIdx = Number(colStr);
      if (!rowId || !Number.isFinite(colIdx)) return null;
      return { rowId, colIdx };
    };

    /** Solo resalte cruzado; la ficha se abre por clic (PlanillaGrid). */
    const onOver = (e: PointerEvent) => {
      if (!fineHover || suppressedRef.current()) return;
      const hit = parseRc(e.target as Element);
      if (!hit) return;
      if (!resolveRef.current(hit.rowId, hit.colIdx)) return;
      applyHl(hit.rowId, hit.colIdx);
    };

    const onOut = (e: PointerEvent) => {
      const related = e.relatedTarget as Element | null;
      if (related?.closest?.("td[data-rc]")) return;
      if (!hover.current?.isVisible()) clearHl();
    };

    const onScroll = () => {
      if (hover.current?.isVisible()) hover.current.forceHide();
      clearHl();
    };

    const onDocPointerDown = (e: PointerEvent) => {
      if (!hover.current?.isVisible()) return;
      const t = e.target as Element | null;
      if (!t) return;
      if (t.closest?.(".planilla-cell-hover")) return;
      if (t.closest?.("td[data-rc]")) return;
      // Menús / sheets / dialogs Radix encima de la planilla.
      if (t.closest?.("[data-radix-popper-content-wrapper]")) return;
      if (t.closest?.("[data-radix-menu-content]")) return;
      if (t.closest?.("[role='dialog']")) return;
      hover.current.forceHide();
      clearHl();
    };

    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerout", onOut);
    root.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("pointerdown", onDocPointerDown, true);

    return () => {
      clearHl();
      mqHover.removeEventListener("change", syncMq);
      mqDesktop.removeEventListener("change", syncMq);
      root.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerout", onOut);
      root.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointerdown", onDocPointerDown, true);
    };
  }, [opts.scrollerRef, opts.hoverRef]);
}
