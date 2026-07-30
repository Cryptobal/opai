"use client";

import { useEffect, useRef } from "react";
import { todayInChile, ymdInChile, addDaysChile } from "@/lib/dates-cl";
import { dueFromYmd, DEFAULT_MINUTE } from "./TareaDatePopover";
import type { TareaItem } from "./types";

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/** Atajos desktop: j/k selección, e completar, t=hoy, m=mañana. */
export function useTareasKeyboard(opts: {
  enabled: boolean;
  /** Sheet/modal abierto → no capturar. */
  sheetOpen: boolean;
  canEdit: boolean;
  tasks: TareaItem[];
  detailId: string | null;
  setDetailId: (id: string | null) => void;
  onToggle: (t: TareaItem) => void;
  onPostpone: (t: TareaItem, next: { dueAt: string | null; allDay: boolean }) => void;
}) {
  const ref = useRef(opts);
  ref.current = opts;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = ref.current;
      if (!h.enabled || h.sheetOpen) return;
      if (isEditableTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const ids = h.tasks.map((t) => t.id);
      if (ids.length === 0) return;
      const idx = h.detailId ? ids.indexOf(h.detailId) : -1;

      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };

      if (e.key === "j" || e.key === "J") {
        return run(() => {
          const next = idx < 0 ? 0 : Math.min(idx + 1, ids.length - 1);
          h.setDetailId(ids[next]!);
          document.querySelector(`[data-tarea-id="${ids[next]}"]`)?.scrollIntoView({ block: "nearest" });
        });
      }
      if (e.key === "k" || e.key === "K") {
        return run(() => {
          const next = idx < 0 ? 0 : Math.max(idx - 1, 0);
          h.setDetailId(ids[next]!);
          document.querySelector(`[data-tarea-id="${ids[next]}"]`)?.scrollIntoView({ block: "nearest" });
        });
      }

      const task = h.detailId ? h.tasks.find((t) => t.id === h.detailId) : null;
      if (!task || !h.canEdit) return;

      if (e.key === "e" || e.key === "E") return run(() => h.onToggle(task));
      if (e.key === "t" || e.key === "T") {
        return run(() => h.onPostpone(task, dueFromYmd(todayInChile(), DEFAULT_MINUTE, true)));
      }
      if (e.key === "m" || e.key === "M") {
        return run(() =>
          h.onPostpone(task, dueFromYmd(ymdInChile(addDaysChile(new Date(), 1)), DEFAULT_MINUTE, true)),
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
