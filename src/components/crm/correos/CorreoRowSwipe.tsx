"use client";

import { useEffect, useRef, useState } from "react";
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
  SWIPE_LONG_RATIO,
  SWIPE_OPEN_WIDTH,
  useRowSwipe,
  type CorreoSwipeSide,
} from "./useRowSwipe";

/** Colores por acción — solo tokens de estado/categóricos del DS. */
const ACTION_CLASS: Record<CorreoSwipeAction, string> = {
  archive: "bg-status-ok-soft text-status-ok-fg",
  trash: "bg-status-danger-soft text-status-danger-fg",
  snooze: "bg-tint-violet/25 text-tint-violet-fg",
  read: "bg-status-info-soft text-status-info-fg",
  star: "bg-status-warn-soft text-status-warn-fg",
  reply: "bg-primary/15 text-primary",
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
  /** Revalidación en background (fetchPage). */
  onChanged?: () => void;
  /** Remoción optimista de la fila + counts. */
  onRemove?: (id: string) => void;
  /** Abre el sheet de posponer. */
  onSnooze?: () => void;
  selected?: boolean;
  focused?: boolean;
  checked?: boolean;
  onToggleCheck?: () => void;
  previewLines?: CorreoPreviewLines;
  /** Acciones configuradas por gesto (persistidas en view prefs). */
  swipeConfig: CorreoSwipeConfig;
  /** Tap en el avatar alterna selección (variante móvil Gmail). */
  onAvatarPress?: () => void;
};

/**
 * Swipe de dos niveles (sólo pointer coarse): el swipe corto revela 2 botones
 * del lado correspondiente y el largo (>55% del ancho) ejecuta la acción
 * principal. En desktop la fila queda como hoy (acciones hover).
 */
export function CorreoRowSwipe({
  thread, canModify, onOpen, onChanged, onRemove, onSnooze,
  selected, focused, checked, onToggleCheck, previewLines, swipeConfig,
  onAvatarPress,
}: Props) {
  const [coarse, setCoarse] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const lastSide = useRef<CorreoSwipeSide>("right");

  useEffect(() => {
    setCoarse(typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const { dx, openSide, dragging, rowRef, close, wasDragged, handlers } = useRowSwipe({
    enabled: coarse && canModify && !leaving,
    onLongSwipe: (side) => execute(side === "right" ? swipeConfig.right[0] : swipeConfig.left[0]),
  });

  if (!coarse) {
    return (
      <CorreoRow thread={thread} canModify={canModify} onOpen={onOpen} onChanged={onChanged}
        selected={selected} focused={focused} checked={checked}
        onToggleCheck={onToggleCheck} previewLines={previewLines} />
    );
  }

  function execute(action: CorreoSwipeAction) {
    if (action === "archive" || action === "trash") {
      if (leaving) return;
      setLeaving(true);
      void runCorreoAction(
        thread.id, action,
        action === "archive" ? "Archivado" : "Movido a la Papelera",
        onChanged, "unarchive",
      );
      window.setTimeout(() => onRemove?.(thread.id), 200);
      return;
    }
    close();
    if (action === "snooze") { onSnooze?.(); return; }
    if (action === "read") {
      void runCorreoAction(
        thread.id, thread.isUnread ? "markRead" : "markUnread",
        thread.isUnread ? "Marcado como leído" : "Marcado como no leído", onChanged,
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
    // reply: abre el hilo enfocando la respuesta (mismo destino que el atajo "r").
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

  if (dx !== 0) lastSide.current = dx > 0 ? "right" : "left";
  const side: CorreoSwipeSide = dx !== 0 ? (dx > 0 ? "right" : "left") : openSide ?? lastSide.current;
  const actions = side === "right" ? swipeConfig.right : swipeConfig.left;
  const rowWidth = rowRef.current?.offsetWidth ?? 360;
  const long = dragging && Math.abs(dx) > rowWidth * SWIPE_LONG_RATIO;
  // El botón principal (índice 0) queda pegado al borde de la pantalla.
  const shown = long ? [actions[0]] : side === "left" ? [actions[1], actions[0]] : actions;
  const revealed = openSide !== null || dx !== 0;

  return (
    <div
      ref={rowRef}
      className={`relative overflow-hidden transition-all duration-200 ${
        leaving ? "max-h-0 opacity-0" : "max-h-[240px] opacity-100"
      }`}
    >
      <div
        aria-hidden={!revealed}
        className={`absolute inset-y-0 flex ${side === "right" ? "left-0" : "right-0"} ${
          dragging ? "" : "transition-[width] duration-150"
        }`}
        style={{ width: Math.max(Math.abs(dx), SWIPE_OPEN_WIDTH) }}
      >
        {shown.map((action) => {
          const meta = actionMeta(action, thread);
          const Icon = meta.icon;
          return (
            <button
              key={action}
              type="button"
              tabIndex={revealed ? 0 : -1}
              onClick={() => execute(action)}
              className={`flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 ds-tap ${ACTION_CLASS[action]}`}
            >
              <Icon className="h-5 w-5" />
              <span className="w-full truncate text-center text-[12px] font-medium">{meta.label}</span>
            </button>
          );
        })}
      </div>
      <div
        className="relative bg-ds-surface-1"
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? "none" : "transform 150ms",
          touchAction: "pan-y",
        }}
        {...handlers}
      >
        {/* Variante Gmail móvil: sin kebab (swipe + long-press + detalle lo
            cubren) y con avatar como toggle de selección. */}
        <CorreoRow thread={thread} canModify={canModify} onOpen={handleOpen} onChanged={onChanged}
          mobileGmail checked={checked} onAvatarPress={onAvatarPress}
          previewLines={previewLines} />
      </div>
    </div>
  );
}
