"use client";

/**
 * Scroll-spy de secciones del workspace CPQ.
 * Observa los `id` de WORKSPACE_SECTIONS presentes en el DOM y devuelve
 * la sección superior visible bajo el stack sticky (isla + barra CPQ).
 */

import { useEffect, useState } from "react";
import { WORKSPACE_SECTIONS, type WorkspaceSectionId } from "./types";

function stickyChromePx(): number {
  if (typeof document === "undefined") return 140;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;" +
    "height:calc(var(--app-island-bottom, 3.5rem) + var(--cpq-sticky-h, 5.375rem))";
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return h > 0 ? h : 140;
}

export function useSectionSpy(enabled = true): WorkspaceSectionId | null {
  const [activeId, setActiveId] = useState<WorkspaceSectionId | null>(null);

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;

    const ids = WORKSPACE_SECTIONS.map((s) => s.id);
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);

    if (elements.length === 0) return;

    let cancelled = false;
    const ratios = new Map<string, number>();

    const pickActive = () => {
      if (cancelled) return;
      let best: { id: WorkspaceSectionId; top: number; ratio: number } | null = null;
      for (const el of elements) {
        const ratio = ratios.get(el.id) ?? 0;
        if (ratio <= 0) continue;
        const top = el.getBoundingClientRect().top;
        if (
          !best ||
          top < best.top - 1 ||
          (Math.abs(top - best.top) <= 1 && ratio > best.ratio)
        ) {
          best = { id: el.id as WorkspaceSectionId, top, ratio };
        }
      }
      if (best) {
        setActiveId(best.id);
        return;
      }
      const offset = stickyChromePx() + 8;
      let fallback: WorkspaceSectionId | null = null;
      for (const el of elements) {
        if (el.getBoundingClientRect().top <= offset) {
          fallback = el.id as WorkspaceSectionId;
        }
      }
      if (fallback) setActiveId(fallback);
    };

    const offset = stickyChromePx();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        pickActive();
      },
      {
        root: null,
        rootMargin: `-${Math.round(offset)}px 0px -45% 0px`,
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      },
    );

    for (const el of elements) observer.observe(el);
    pickActive();

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [enabled]);

  return activeId;
}
