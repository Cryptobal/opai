"use client";

import { useEffect, useRef } from "react";
import type { CellHoverCardHandle } from "./CellHoverCard";
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";

/** Un poco más pausado que el tiro de 240 ms: da tiempo a cruzar celdas. */
const OPEN_MS = 420;
const CLOSE_MS = 180;
const SWITCH_MS = 520;

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
    let activeKey: string | null = null;

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

    const cancelOpen = () => {
      if (openTimer) clearTimeout(openTimer);
      openTimer = null;
    };
    const cancelClose = () => {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = null;
    };

    const doHide = () => {
      if (hover.current?.isPinned()) return;
      hover.current?.hide();
      clearHl();
      activeKey = null;
    };

    const scheduleHide = () => {
      cancelOpen();
      cancelClose();
      closeTimer = setTimeout(doHide, CLOSE_MS);
    };

    const parseRc = (el: Element | null): { rowId: string; colIdx: number; td: HTMLElement; key: string } | null => {
      const td = el?.closest?.("td[data-rc]") as HTMLElement | null;
      if (!td) return null;
      const rc = td.getAttribute("data-rc");
      if (!rc) return null;
      const [rowId, colStr] = rc.split(":");
      const colIdx = Number(colStr);
      if (!rowId || !Number.isFinite(colIdx)) return null;
      return { rowId, colIdx, td, key: rc };
    };

    /** ¿El puntero está sobre la ficha (o el puente hacia ella)? */
    const pointerOnCard = (x: number, y: number) => {
      const el = document.querySelector(".planilla-cell-hover") as HTMLElement | null;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      // Margen superior generoso: puente desde la celda fuente hasta la ficha.
      return x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 20 && y <= r.bottom + 4;
    };

    /** Celdas tapadas por la ficha no deben robar el hover. */
    const cellUnderCard = (td: HTMLElement) => {
      const el = document.querySelector(".planilla-cell-hover") as HTMLElement | null;
      if (!el || !hover.current?.isVisible()) return false;
      const cr = el.getBoundingClientRect();
      const tr = td.getBoundingClientRect();
      const overlapX = tr.left < cr.right && tr.right > cr.left;
      const overlapY = tr.top < cr.bottom && tr.bottom > cr.top;
      return overlapX && overlapY;
    };

    const showFor = (hit: { rowId: string; colIdx: number; td: HTMLElement; key: string }) => {
      if (suppressedRef.current() || hover.current?.isPinned()) return;
      const ctx = resolveRef.current(hit.rowId, hit.colIdx);
      if (!ctx) return;
      const rect = hit.td.getBoundingClientRect();
      hover.current?.show(ctx, rect);
      applyHl(hit.rowId, hit.colIdx);
      activeKey = hit.key;
    };

    const onOver = (e: PointerEvent) => {
      if (!fineHover || suppressedRef.current()) {
        cancelOpen();
        return;
      }
      if (hover.current?.isPinned()) return;

      // Puntero sobre/cerca de la ficha: mantener, no cambiar de celda.
      if (pointerOnCard(e.clientX, e.clientY)) {
        cancelClose();
        cancelOpen();
        return;
      }

      const hit = parseRc(e.target as Element);
      if (!hit) {
        if ((e.target as Element)?.closest?.(".planilla-cell-hover")) {
          cancelClose();
          return;
        }
        scheduleHide();
        return;
      }

      // Misma celda ya mostrada: no reiniciar timers.
      if (activeKey === hit.key && hover.current?.isVisible()) {
        cancelClose();
        cancelOpen();
        return;
      }

      // Celda bajo la ficha abierta: ignorar (evita el salto al bajar a Acciones).
      if (cellUnderCard(hit.td)) {
        cancelClose();
        cancelOpen();
        return;
      }

      cancelClose();
      cancelOpen();
      const delay = activeKey && hover.current?.isVisible() ? SWITCH_MS : OPEN_MS;
      openTimer = setTimeout(() => showFor(hit), delay);
    };

    const onOut = (e: PointerEvent) => {
      const related = e.relatedTarget as Element | null;
      if (related?.closest?.(".planilla-cell-hover")) {
        cancelClose();
        return;
      }
      if (related?.closest?.("td[data-rc]")) {
        // Cambio celda→celda: onOver de la nueva decide; no ocultar aquí.
        return;
      }
      // Si el puntero sigue cerca de la ficha (relatedTarget null en algunos browsers).
      if (hover.current?.isVisible() && pointerOnCard(e.clientX, e.clientY)) {
        cancelClose();
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
        activeKey = null;
      }
    };

    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerout", onOut);
    root.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelOpen();
      cancelClose();
      clearHl();
      mqHover.removeEventListener("change", syncMq);
      mqDesktop.removeEventListener("change", syncMq);
      root.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerout", onOut);
      root.removeEventListener("scroll", onScroll);
    };
  }, [opts.scrollerRef, opts.hoverRef]);
}
