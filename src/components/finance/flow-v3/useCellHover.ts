"use client";

import { useEffect, useRef } from "react";
import type { CellHoverCardHandle } from "./CellHoverCard";
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";

const OPEN_MS = 240;
const CLOSE_MS = 130;

export interface HoverResolveResult {
  row: FlowMatrixRowDto;
  cell: FlowMatrixCellDto;
  colIdx: number;
  rowNumber: number;
  isPast: boolean;
  reason?: string;
}

/**
 * Listener nativo delegado sobre `.planilla-grid-scroll`.
 * Cero setState en el grid: solo llama a la ref imperativa de CellHoverCard
 * y aplica resalte cruzado vía classList.
 */
export function useCellHover(opts: {
  scrollerRef: React.RefObject<HTMLElement | null>;
  hoverRef: React.RefObject<CellHoverCardHandle | null>;
  resolve: (rowId: string, colIdx: number) => HoverResolveResult | null;
  /** true → no abrir (edición, drag, Σ, menú, panel, etc.). */
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

    let openTimer: ReturnType<typeof setTimeout> | null = null;
    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    let hlCol = -1;
    let hlRow: string | null = null;
    let fineHover = false;

    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const syncMq = () => { fineHover = mq.matches; };
    syncMq();
    mq.addEventListener("change", syncMq);

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

    const cancelOpen = () => {
      if (openTimer) clearTimeout(openTimer);
      openTimer = null;
    };
    const cancelClose = () => {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = null;
    };

    const scheduleHide = () => {
      cancelOpen();
      cancelClose();
      closeTimer = setTimeout(() => {
        if (hover.current?.isPinned()) return;
        hover.current?.hide();
        clearHl();
      }, CLOSE_MS);
    };

    const parseRc = (el: Element | null): { rowId: string; colIdx: number; td: HTMLElement } | null => {
      const td = el?.closest?.("td[data-rc]") as HTMLElement | null;
      if (!td) return null;
      const rc = td.getAttribute("data-rc");
      if (!rc) return null;
      const [rowId, colStr] = rc.split(":");
      const colIdx = Number(colStr);
      if (!rowId || !Number.isFinite(colIdx)) return null;
      return { rowId, colIdx, td };
    };

    const onOver = (e: PointerEvent) => {
      if (!fineHover || suppressedRef.current()) {
        cancelOpen();
        return;
      }
      if (hover.current?.isPinned()) return;
      const hit = parseRc(e.target as Element);
      if (!hit) {
        // Entrar a la ficha no cierra.
        if ((e.target as Element)?.closest?.(".planilla-cell-hover")) {
          cancelClose();
          return;
        }
        scheduleHide();
        return;
      }
      cancelClose();
      cancelOpen();
      openTimer = setTimeout(() => {
        if (suppressedRef.current() || hover.current?.isPinned()) return;
        const ctx = resolveRef.current(hit.rowId, hit.colIdx);
        if (!ctx) return;
        const rect = hit.td.getBoundingClientRect();
        hover.current?.show(ctx, rect);
        applyHl(hit.rowId, hit.colIdx);
      }, OPEN_MS);
    };

    const onOut = (e: PointerEvent) => {
      const related = e.relatedTarget as Element | null;
      if (related?.closest?.("td[data-rc]") || related?.closest?.(".planilla-cell-hover")) {
        return;
      }
      scheduleHide();
    };

    const onScroll = () => {
      cancelOpen();
      cancelClose();
      if (!hover.current?.isPinned()) {
        hover.current?.hide();
        clearHl();
      }
    };

    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerout", onOut);
    root.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelOpen();
      cancelClose();
      clearHl();
      mq.removeEventListener("change", syncMq);
      root.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerout", onOut);
      root.removeEventListener("scroll", onScroll);
    };
  }, [opts.scrollerRef, opts.hoverRef]);
}
