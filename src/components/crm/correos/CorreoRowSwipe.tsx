"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import type { CorreoListMode, CorreoRowMode } from "./useCorreoWorkspaceLayout";
import {
  SWIPE_BUTTON_WIDTH,
  SWIPE_OPEN_WIDTH,
  useRowSwipe,
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
  onOpen: (id: string) => void;
  onChanged?: () => void;
  /** Patch optimista local (read/star) antes del round-trip. */
  onPatch?: (id: string, partial: Partial<CorreoThreadDTO>) => void;
  onRemoveDone?: () => void;
  onUndoDone?: () => void;
  onRemove?: (id: string) => void;
  onSnooze?: (id: string) => void;
  onAiMenu?: (id: string, anchor: { x: number; y: number }) => void;
  selected?: boolean;
  focused?: boolean;
  checked?: boolean;
  onToggleCheck?: (id: string) => void;
  previewLines?: CorreoPreviewLines;
  swipeConfig: CorreoSwipeConfig;
  onAvatarPress?: (id: string) => void;
  onLongPress?: (id: string) => void;
  selectionMode?: boolean;
  unified?: boolean;
  mailboxColor?: string | null;
  mailboxLabel?: string | null;
  listMode?: CorreoListMode;
  rowMode?: CorreoRowMode;
};

const LEAVE_MS = 200;

function SwipeActionStrip({
  actions,
  thread,
  revealed,
  onExecute,
}: {
  actions: CorreoSwipeAction[];
  thread: CorreoThreadDTO;
  revealed: boolean;
  onExecute: (action: CorreoSwipeAction) => void;
}) {
  return (
    <>
      {actions.map((action) => {
        const meta = actionMeta(action, thread);
        const Icon = meta.icon;
        const style = ACTION_STYLE[action];
        return (
          <button
            key={action}
            type="button"
            tabIndex={revealed ? 0 : -1}
            onClick={() => onExecute(action)}
            className={`flex h-full flex-col items-center justify-center gap-0.5 px-1 ds-tap ${style.bg} ${style.fg}`}
            style={{ width: SWIPE_BUTTON_WIDTH }}
          >
            <Icon className="h-5 w-5" />
            <span className="w-full truncate text-center text-[12px] font-medium">{meta.label}</span>
          </button>
        );
      })}
    </>
  );
}

/**
 * Swipe lateral (sólo pointer coarse): revela 2 botones por lado;
 * la acción se ejecuta solo al tocar un botón (nunca al soltar el deslizamiento).
 */
function CorreoRowSwipeInner({
  thread, canModify, onOpen, onChanged, onPatch, onRemoveDone, onUndoDone, onRemove, onSnooze,
  onAiMenu,
  selected, focused, checked, onToggleCheck, previewLines, swipeConfig,
  onAvatarPress, onLongPress, selectionMode = false,
  unified = false, mailboxColor = null, mailboxLabel = null,
  listMode = "full", rowMode = "default",
}: Props) {
  const [coarse, setCoarse] = useState(false);
  const [leaving, setLeaving] = useState(false);
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
    touchAction,
    rowRef,
    measureWidth,
    close,
    wasDragged,
    longPressHandlers,
    dragProps,
  } = useRowSwipe({
    enabled: coarse && canModify && !leaving && !selectionMode,
    onLongPress: coarse && onLongPress ? () => onLongPress(thread.id) : undefined,
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

  const rightStripOpacity = useTransform(x, (value) => (value > 0 ? 1 : 0));
  const leftStripOpacity = useTransform(x, (value) => (value < 0 ? 1 : 0));

  function execute(action: CorreoSwipeAction) {
    if (action === "archive" || action === "trash") {
      if (leaving) return;
      setLeaving(true);
      const undo = action === "archive" ? "unarchive" : "untrash";
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
    if (action === "snooze") { onSnooze?.(thread.id); return; }
    if (action === "read") {
      const wasUnread = thread.isUnread;
      onPatch?.(thread.id, { isUnread: !wasUnread });
      void runCorreoAction(
        thread.id, wasUnread ? "markRead" : "markUnread",
        wasUnread ? "Marcado como leído" : "Marcado como no leído",
        onChanged,
        wasUnread ? "markUnread" : "markRead",
      ).then((ok) => {
        if (!ok) onPatch?.(thread.id, { isUnread: wasUnread });
      });
      return;
    }
    if (action === "star") {
      const starred = Boolean(thread.starredAt);
      const nextStarredAt = starred ? null : new Date().toISOString();
      onPatch?.(thread.id, { starredAt: nextStarredAt });
      void runCorreoAction(
        thread.id, starred ? "unstar" : "star",
        starred ? "Quitado de destacados" : "Destacado",
        onChanged, starred ? "star" : "unstar",
      ).then((ok) => {
        if (!ok) onPatch?.(thread.id, { starredAt: thread.starredAt });
      });
      return;
    }
    onOpen(thread.id);
    window.setTimeout(() => {
      document.getElementById("correo-suggested-reply")?.scrollIntoView({ block: "center" });
    }, 600);
  }

  function handleOpen() {
    if (wasDragged()) return;
    if (openSide) { close(); return; }
    onOpen(thread.id);
  }

  if (!coarse) {
    return (
      <CorreoRow
        thread={thread}
        canModify={canModify}
        onOpen={() => onOpen(thread.id)}
        onChanged={onChanged}
        onRemoveDone={onRemoveDone}
        onUndoDone={onUndoDone}
        onRemove={onRemove}
        onSnooze={onSnooze ? () => onSnooze(thread.id) : undefined}
        onAiMenu={onAiMenu ? (anchor) => onAiMenu(thread.id, anchor) : undefined}
        selected={selected}
        focused={focused}
        checked={checked}
        onToggleCheck={onToggleCheck ? () => onToggleCheck(thread.id) : undefined}
        previewLines={previewLines}
        unified={unified}
        mailboxColor={mailboxColor}
        mailboxLabel={mailboxLabel}
        listMode={listMode}
        rowMode={rowMode}
      />
    );
  }

  const rightActions = swipeConfig.right;
  const leftActions = swipeConfig.left;
  // Lado izquierdo: visualmente [secundaria, primaria] anclado a la derecha.
  const leftShown: CorreoSwipeAction[] = [leftActions[1], leftActions[0]];
  const revealed = openSide !== null;

  return (
    <div
      ref={rowRef}
      data-correo-swipe-row=""
      className={`relative overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${
        leaving ? "max-h-0 opacity-0" : "max-h-[240px] opacity-100"
      }`}
    >
      {/* Strip derecho (swipe →): anclado a la izquierda. */}
      <motion.div
        aria-hidden={!revealed || openSide !== "right"}
        className="absolute inset-y-0 left-0 flex"
        style={{ width: SWIPE_OPEN_WIDTH, opacity: rightStripOpacity }}
      >
        <SwipeActionStrip
          actions={rightActions}
          thread={thread}
          revealed={revealed && openSide === "right"}
          onExecute={execute}
        />
      </motion.div>

      {/* Strip izquierdo (swipe ←): anclado a la derecha. */}
      <motion.div
        aria-hidden={!revealed || openSide !== "left"}
        className="absolute inset-y-0 right-0 flex"
        style={{ width: SWIPE_OPEN_WIDTH, opacity: leftStripOpacity }}
      >
        <SwipeActionStrip
          actions={leftShown}
          thread={thread}
          revealed={revealed && openSide === "left"}
          onExecute={execute}
        />
      </motion.div>

      <motion.div
        className="relative bg-ds-surface-1 touch-pan-y will-change-transform"
        style={{ x, touchAction }}
        {...longPressHandlers}
        {...dragProps}
      >
        <CorreoRow
          thread={thread}
          canModify={canModify}
          onOpen={handleOpen}
          onChanged={onChanged}
          mobileGmail
          checked={checked}
          onAvatarPress={
            onAvatarPress
              ? () => {
                  if (!wasDragged()) {
                    if (openSide) { close(); return; }
                    onAvatarPress(thread.id);
                  }
                }
              : undefined
          }
          previewLines={previewLines}
          unified={unified}
          mailboxColor={mailboxColor}
          mailboxLabel={mailboxLabel}
        />
      </motion.div>
    </div>
  );
}

function propsAreEqual(prev: Props, next: Props): boolean {
  return (
    prev.thread === next.thread &&
    prev.canModify === next.canModify &&
    prev.selected === next.selected &&
    prev.focused === next.focused &&
    prev.checked === next.checked &&
    prev.selectionMode === next.selectionMode &&
    prev.previewLines === next.previewLines &&
    prev.swipeConfig === next.swipeConfig &&
    prev.onOpen === next.onOpen &&
    prev.onChanged === next.onChanged &&
    prev.onPatch === next.onPatch &&
    prev.onRemoveDone === next.onRemoveDone &&
    prev.onUndoDone === next.onUndoDone &&
    prev.onRemove === next.onRemove &&
    prev.onSnooze === next.onSnooze &&
    prev.onAiMenu === next.onAiMenu &&
    prev.onToggleCheck === next.onToggleCheck &&
    prev.onAvatarPress === next.onAvatarPress &&
    prev.onLongPress === next.onLongPress &&
    prev.unified === next.unified &&
    prev.mailboxColor === next.mailboxColor &&
    prev.mailboxLabel === next.mailboxLabel &&
    prev.listMode === next.listMode &&
    prev.rowMode === next.rowMode
  );
}

export const CorreoRowSwipe = memo(CorreoRowSwipeInner, propsAreEqual);
