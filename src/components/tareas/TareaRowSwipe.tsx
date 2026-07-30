"use client";

import { useEffect } from "react";
import { motion, useTransform } from "framer-motion";
import { CalendarPlus, Check } from "lucide-react";
import { ymdInChile, addDaysChile } from "@/lib/dates-cl";
import {
  SWIPE_BUTTON_WIDTH,
  SWIPE_OPEN_WIDTH,
  useRowSwipe,
} from "@/hooks/row-swipe";
import { dueFromYmd, DEFAULT_MINUTE, type DueValue } from "./TareaDatePopover";
import { TareaRow } from "./TareaRow";
import type { TareaItem } from "./types";

/** Swipe móvil: ← completar · → posponer a mañana (undo en el caller). */
export function TareaRowSwipe(props: {
  task: TareaItem;
  nameById: Map<string, string>;
  canEdit: boolean;
  canDelete: boolean;
  selected?: boolean;
  onOpen: (t: TareaItem) => void;
  onToggle: (t: TareaItem) => void;
  onDelete: (id: string) => void;
  onPostpone: (t: TareaItem, next: DueValue) => void;
  onPriority?: (t: TareaItem, next: TareaItem["priority"]) => void;
}) {
  const { task, canEdit, onOpen, onToggle, onPostpone } = props;
  const {
    x, openSide, touchAction, rowRef, measureWidth, close, wasDragged,
    longPressHandlers, dragProps,
  } = useRowSwipe({ enabled: canEdit });

  useEffect(() => { measureWidth(); }, [measureWidth, task.id]);

  const rightOpacity = useTransform(x, (v) => (v > 0 ? 1 : 0));
  const leftOpacity = useTransform(x, (v) => (v < 0 ? 1 : 0));
  const tomorrow = () =>
    dueFromYmd(ymdInChile(addDaysChile(new Date(), 1)), DEFAULT_MINUTE, true);

  const rowProps = {
    ...props,
    onOpen: (t: TareaItem) => {
      if (wasDragged()) return;
      if (openSide) { close(); return; }
      onOpen(t);
    },
  };

  if (!canEdit) return <TareaRow {...rowProps} />;

  return (
    <div ref={rowRef} className="relative overflow-hidden">
      <motion.div
        aria-hidden={openSide !== "right"}
        className="absolute inset-y-0 left-0 flex"
        style={{ width: SWIPE_OPEN_WIDTH, opacity: rightOpacity }}
      >
        <button
          type="button"
          tabIndex={openSide === "right" ? 0 : -1}
          onClick={() => { close(); onPostpone(task, tomorrow()); }}
          className="flex h-full flex-col items-center justify-center gap-0.5 bg-status-warn-soft text-status-warn-fg"
          style={{ width: SWIPE_BUTTON_WIDTH * 2 }}
        >
          <CalendarPlus className="h-5 w-5" />
          <span className="text-[12px] font-medium">Mañana</span>
        </button>
      </motion.div>
      <motion.div
        aria-hidden={openSide !== "left"}
        className="absolute inset-y-0 right-0 flex"
        style={{ width: SWIPE_OPEN_WIDTH, opacity: leftOpacity }}
      >
        <button
          type="button"
          tabIndex={openSide === "left" ? 0 : -1}
          onClick={() => { close(); onToggle(task); }}
          className="flex h-full flex-col items-center justify-center gap-0.5 bg-status-ok-soft text-status-ok-fg"
          style={{ width: SWIPE_BUTTON_WIDTH * 2 }}
        >
          <Check className="h-5 w-5" />
          <span className="text-[12px] font-medium">Completar</span>
        </button>
      </motion.div>
      <motion.div
        className="relative bg-ds-surface-1 touch-pan-y will-change-transform"
        style={{ x, touchAction }}
        {...longPressHandlers}
        {...dragProps}
      >
        <TareaRow {...rowProps} />
      </motion.div>
    </div>
  );
}
