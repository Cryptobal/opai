"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useTransform } from "framer-motion";
import { Archive, Clock, Mail, MailOpen, Reply, Star, Trash2, type LucideIcon } from "lucide-react";
import { CorreoRow } from "./CorreoRow";
import { runCorreoAction } from "./correo-thread-action-client";
import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";
import type {
  CorreoPreviewLines,
  CorreoSwipeAction,
  CorreoSwipeConfig,
} from "./useCorreosViewPreferences";
import {
  SWIPE_BUTTON_WIDTH,
  SWIPE_COMMIT_RATIO,
  SWIPE_OPEN_WIDTH,
  useRowSwipe,
  type CorreoSwipeSide,
} from "./useRowSwipe";

/** Colores por acción — solo tokens de estado/categóricos del DS. */
const ACTION_STYLE: Record<CorreoSwipeAction, { bg: string; fg: string }> = {
  archive: { bg: "bg-status-ok-soft", fg: "text-status-ok-fg" },
  trash: { bg: "bg-status-danger-soft", fg: "text-status-danger-fg" },
  snooze: { bg: "bg-tint-violet/25", fg: "text-tint-violet-fg" },
  read: { bg: "bg-status-info-soft", fg: "text-status-info-fg" },
  star: { bg: "bg-status-warn-soft", fg: "text-status-warn-fg" },
  reply: { bg: "bg-primary/15", fg: "text-primary" },
};

function actionMeta(action: CorreoSwipeAction, thread: CorreoThreadDTO): { icon: LucideIcon; label: string } {
  switch (action) {
    case "archive": return { icon: Archive, label: "Archivar" };
    case "trash": return { icon: Trash2, label: "Papelera" };
    case "snooze": return { icon: Clock, label: "Posponer" };
    case "read": return thread.isUnread ? { icon: MailOpen, label: "Leído" } : { icon: Mail, label: "No leído" };
    case "star": return { icon: Star, label: thread.starredAt ? "Quitar" : "Destacar" };
    case "reply": return { icon: Reply, label: "Responder" };
  }
}

type Props = {
  thread: CorreoThreadDTO;
  canModify: boolean;
  onOpen: () => void;
  onChanged?: () => void;
  onRemoveDone?: () => void;
  onUndoDone?: () => void;
  onRemove?: (id: string) => void;
  onSnooze?: () => void;
  onAiMenu?: (anchor: { x: number; y: number }) => void;
  selected?: boolean;
  focused?: boolean;
  checked?: boolean;
  onToggleCheck?: () => void;
  previewLines?: CorreoPreviewLines;
  swipeConfig: CorreoSwipeConfig;
  onAvatarPress?: () => void;
  onLongPress?: () => void;
  selectionMode?: boolean;
};

const LEAVE_MS = 200;

/**
 * Swipe de dos niveles (sólo pointer coarse): snap revela 2 botones (tap);
 * commit o flick ejecuta la principal. Botones de ancho fijo; overlay de commit.
 */
export function CorreoRowSwipe({
  thread, canModify, onOpen, onChanged, onRemoveDone, onUndoDone, onRemove, onSnooze,
  onAiMenu,
  selected, focused, checked, onToggleCheck, previewLines, swipeConfig,
  onAvatarPress, onLongPress, selectionMode = false,
}: Props) {
  const [coarse, setCoarse] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const lastSide = useRef<CorreoSwipeSide>("right");
  const leaveTimer = useRef<number | null>(null);

  useEffect(() => {
    setCoarse(typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  }, []);

  useEffect(() => () => {
    if (leaveTimer.current != null) window.clearTimeout(leaveTimer.current);
  }, []);

  const {
    x,
    openSide,
    dragging,
    dragSide,
    touchAction,
    rowRef,
    measureWidth,
    close,
    wasDragged,
    longPressHandlers,
    dragProps,
  } = useRowSwipe({
    enabled: coarse && canModify && !leaving && !selectionMode,
    onCommitSwipe: (side) => execute(side === "right" ? swipeConfig.right[0] : swipeConfig.left[0]),
    onLongPress: coarse && onLongPress ? onLongPress : undefined,
  });

  useEffect(() => {
    if (selectionMode) close();
  }, [selectionMode, close]);

  useLayoutEffect(() => {
    if (!coarse) return;
    measureWidth();
    const node = rowRef.current;
    if (!node) return;
    const ro = new ResizeObserver(() => {
      measureWidth();
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [rowRef, coarse, measureWidth]);

  const armedOverlayOpacity = useTransform(x, (value) => {
    const abs = Math.abs(value);
    const width = rowRef.current?.offsetWidth || 360;
    const threshold = width * SWIPE_COMMIT_RATIO;
    if (abs < threshold) return 0;
    const progress = Math.min(1, (abs - threshold) / Math.max(threshold * 0.35, 1));
    return 0.45 + 0.55 * progress;
  });

  const commitIconLeft = useTransform(x, (value) => {
    const width = rowRef.current?.offsetWidth || 360;
    // Anclado al borde interior de la fila que sigue al dedo.
    if (value >= 0) return Math.max(12, value - 36);
    return Math.max(12, width + value + 12);
  });

  const hideActionButtons = useTransform(x, (value) => {
    const abs = Math.abs(value);
    const width = rowRef.current?.offsetWidth || 360;
    return abs >= width * SWIPE_COMMIT_RATIO ? 0 : 1;
  });

  if (!coarse) {
    return (
      <CorreoRow thread={thread} canModify={canModify} onOpen={onOpen} onChanged={onChanged}
        onRemoveDone={onRemoveDone} onUndoDone={onUndoDone} onRemove={onRemove}
        onSnooze={onSnooze} onAiMenu={onAiMenu}
        selected={selected} focused={focused} checked={checked}
        onToggleCheck={onToggleCheck} previewLines={previewLines} />
    );
  }

  function execute(action: CorreoSwipeAction) {
    if (action === "archive" || action === "trash") {
      if (leaving) return;
      setLeaving(true);
      const undo = action === "archive" ? "unarchive" : "untrash";
      // Esperar la animación de colapso antes de desmontar la fila.
      leaveTimer.current = window.setTimeout(() => {
        leaveTimer.current = null;
        onRemove?.(thread.id);
      }, LEAVE_MS);
      void runCorreoAction(
        thread.id,
        action,
        action === "archive" ? "Archivado" : "Movido a la Papelera",
        onRemoveDone ?? onChanged,
        undo,
        onUndoDone,
      ).then((ok) => {
        if (!ok) {
          if (leaveTimer.current != null) {
            window.clearTimeout(leaveTimer.current);
            leaveTimer.current = null;
          }
          setLeaving(false);
          if (onUndoDone) onUndoDone();
          else onChanged?.();
        }
      });
      return;
    }
    close();
    if (action === "snooze") { onSnooze?.(); return; }
    if (action === "read") {
      const wasUnread = thread.isUnread;
      void runCorreoAction(
        thread.id, wasUnread ? "markRead" : "markUnread",
        wasUnread ? "Marcado como leído" : "Marcado como no leído",
        onChanged,
        wasUnread ? "markUnread" : "markRead",
      );
      return;
    }
    if (action === "star") {
      const starred = Boolean(thread.starredAt);
      void runCorreoAction(
        thread.id, starred ? "unstar" : "star",
        starred ? "Quitado de destacados" : "Destacado",
        onChanged, starred ? "star" : "unstar",
      );
      return;
    }
    onOpen();
    window.setTimeout(() => {
      document.getElementById("correo-suggested-reply")?.scrollIntoView({ block: "center" });
    }, 600);
  }

  function handleOpen() {
    if (wasDragged()) return;
    if (openSide) { close(); return; }
    onOpen();
  }

  const side = dragSide ?? openSide ?? lastSide.current;
  if (openSide) lastSide.current = openSide;
  if (dragSide) lastSide.current = dragSide;

  const actions = side === "right" ? swipeConfig.right : swipeConfig.left;
  const primary = actions[0];
  const primaryMeta = actionMeta(primary, thread);
  const PrimaryIcon = primaryMeta.icon;
  const shown = side === "left" ? [actions[1], actions[0]] : actions;
  const revealed = openSide !== null || dragging;

  return (
    <div
      ref={rowRef}
      data-correo-swipe-row=""
      className={`relative overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${
        leaving ? "max-h-0 opacity-0" : "max-h-[240px] opacity-100"
      }`}
    >
      {/* Strip de acciones: ancho fijo, anclado al borde, revelado por traslación. */}
      <motion.div
        aria-hidden={!revealed}
        className={`absolute inset-y-0 flex ${side === "right" ? "left-0" : "right-0"}`}
        style={{
          width: SWIPE_OPEN_WIDTH,
          opacity: hideActionButtons,
        }}
      >
        {shown.map((action) => {
          const meta = actionMeta(action, thread);
          const Icon = meta.icon;
          const style = ACTION_STYLE[action];
          return (
            <button
              key={action}
              type="button"
              tabIndex={revealed ? 0 : -1}
              onClick={() => execute(action)}
              className={`flex h-full flex-col items-center justify-center gap-0.5 px-1 ds-tap ${style.bg} ${style.fg}`}
              style={{ width: SWIPE_BUTTON_WIDTH }}
            >
              <Icon className="h-5 w-5" />
              <span className="w-full truncate text-center text-[12px] font-medium">{meta.label}</span>
            </button>
          );
        })}
      </motion.div>

      {/* Overlay de commit: llena el strip con el color de la acción principal. */}
      <motion.div
        aria-hidden
        className={`pointer-events-none absolute inset-0 ${ACTION_STYLE[primary].bg}`}
        style={{ opacity: armedOverlayOpacity }}
      >
        <motion.div
          className="absolute inset-y-0 flex items-center"
          style={{ left: commitIconLeft }}
        >
          <PrimaryIcon
            className={`h-6 w-6 scale-125 ${ACTION_STYLE[primary].fg}`}
          />
        </motion.div>
      </motion.div>

      <motion.div
        className="relative bg-ds-surface-1 touch-pan-y will-change-transform"
        style={{ x, touchAction }}
        {...longPressHandlers}
        {...dragProps}
      >
        <CorreoRow thread={thread} canModify={canModify} onOpen={handleOpen} onChanged={onChanged}
          mobileGmail checked={checked}
          onAvatarPress={onAvatarPress ? () => { if (!wasDragged()) onAvatarPress(); } : undefined}
          previewLines={previewLines} />
      </motion.div>
    </div>
  );
}
