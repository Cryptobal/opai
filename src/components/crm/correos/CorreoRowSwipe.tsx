"use client";

import { useEffect, useRef, useState } from "react";
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
import { SWIPE_LONG_RATIO, useRowSwipe, type CorreoSwipeSide } from "./useRowSwipe";

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

/**
 * Swipe de dos niveles (sólo pointer coarse): corto revela 2 botones o ejecuta
 * la secundaria; largo o flick ejecuta la principal. Motion values + spring.
 */
export function CorreoRowSwipe({
  thread, canModify, onOpen, onChanged, onRemoveDone, onUndoDone, onRemove, onSnooze,
  selected, focused, checked, onToggleCheck, previewLines, swipeConfig,
  onAvatarPress, onLongPress, selectionMode = false,
}: Props) {
  const [coarse, setCoarse] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const lastSide = useRef<CorreoSwipeSide>("right");
  const rowWidthRef = useRef(360);

  useEffect(() => {
    setCoarse(typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const {
    x,
    openSide,
    dragging,
    dragSide,
    touchAction,
    rowRef,
    close,
    wasDragged,
    handlers,
  } = useRowSwipe({
    enabled: coarse && canModify && !leaving && !selectionMode,
    onLongSwipe: (side) => execute(side === "right" ? swipeConfig.right[0] : swipeConfig.left[0]),
    onButtonSwipe: (side, buttonIndex) => {
      const actions = side === "right" ? swipeConfig.right : swipeConfig.left;
      execute(actions[buttonIndex]);
    },
    onLongPress: coarse && canModify ? onLongPress : undefined,
  });

  useEffect(() => {
    if (selectionMode) close();
  }, [selectionMode, close]);

  useEffect(() => {
    const node = rowRef.current;
    if (!node) return;
    rowWidthRef.current = node.offsetWidth;
    const ro = new ResizeObserver(([entry]) => {
      rowWidthRef.current = entry.contentRect.width;
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [rowRef, coarse]);

  const actionStripWidth = useTransform(x, (value) => Math.abs(value));
  const armedOverlayOpacity = useTransform(x, (value) => {
    const abs = Math.abs(value);
    const threshold = rowWidthRef.current * SWIPE_LONG_RATIO;
    if (abs < threshold) return 0;
    const progress = Math.min(1, abs / threshold);
    return 0.35 + 0.65 * progress;
  });
  const hideActionButtons = useTransform(x, (value) => {
    const abs = Math.abs(value);
    return abs >= rowWidthRef.current * SWIPE_LONG_RATIO ? 0 : 1;
  });

  if (!coarse) {
    return (
      <CorreoRow thread={thread} canModify={canModify} onOpen={onOpen} onChanged={onChanged}
        onRemoveDone={onRemoveDone} onUndoDone={onUndoDone} onRemove={onRemove}
        onSnooze={onSnooze} selected={selected} focused={focused} checked={checked}
        onToggleCheck={onToggleCheck} previewLines={previewLines} />
    );
  }

  function execute(action: CorreoSwipeAction) {
    if (action === "archive" || action === "trash") {
      if (leaving) return;
      setLeaving(true);
      const undo = action === "archive" ? "unarchive" : undefined;
      // Remoción inmediata (avanza el lector en desktop); soft refresh al
      // confirmar; hard refresh al Deshacer para rehidratar la fila.
      onRemove?.(thread.id);
      void runCorreoAction(
        thread.id,
        action,
        action === "archive" ? "Archivado" : "Movido a la Papelera",
        onRemoveDone ?? onChanged,
        undo,
        onUndoDone,
      ).then((ok) => {
        if (!ok) {
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
      className={`relative overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${
        leaving ? "max-h-0 opacity-0" : "max-h-[240px] opacity-100"
      }`}
    >
      <motion.div
        aria-hidden
        className={`pointer-events-none absolute inset-0 flex items-center ${
          side === "right" ? "justify-start" : "justify-end"
        } ${ACTION_STYLE[primary].bg}`}
        style={{ opacity: armedOverlayOpacity }}
      >
        <PrimaryIcon
          className={`mx-6 h-6 w-6 scale-125 ${ACTION_STYLE[primary].fg}`}
        />
      </motion.div>
      <motion.div
        aria-hidden={!revealed}
        className={`absolute inset-y-0 flex ${side === "right" ? "left-0" : "right-0"}`}
        style={{
          width: actionStripWidth,
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
              className={`flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 ds-tap ${style.bg} ${style.fg}`}
            >
              <Icon className="h-5 w-5" />
              <span className="w-full truncate text-center text-[12px] font-medium">{meta.label}</span>
            </button>
          );
        })}
      </motion.div>
      <motion.div
        className="relative bg-ds-surface-1 will-change-transform"
        style={{ x, touchAction }}
        {...handlers}
      >
        <CorreoRow thread={thread} canModify={canModify} onOpen={handleOpen} onChanged={onChanged}
          mobileGmail checked={checked}
          onAvatarPress={onAvatarPress ? () => { if (!wasDragged()) onAvatarPress(); } : undefined}
          previewLines={previewLines} />
      </motion.div>
    </div>
  );
}
