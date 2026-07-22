"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, Trash2 } from "lucide-react";
import { CorreoRow } from "./CorreoRow";
import { CorreoRowMenu } from "./CorreoRowMenu";
import { runCorreoAction } from "./correo-thread-action-client";
import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";
import type { CorreoPreviewLines } from "./useCorreosViewPreferences";

const THRESHOLD = 96;

type Props = {
  thread: CorreoThreadDTO;
  canModify: boolean;
  onOpen: () => void;
  /** Revalidación en background (fetchPage). */
  onChanged?: () => void;
  /** Remoción optimista de la fila + counts. */
  onRemove?: (id: string) => void;
  /** Abre el sheet de posponer (Bloque 3). */
  onSnooze?: () => void;
  selected?: boolean;
  previewLines?: CorreoPreviewLines;
};

/**
 * Envuelve una fila de correo con swipe táctil (sólo pointer coarse):
 * → derecha archiva, ← izquierda elimina, ambos con "Deshacer". En desktop la
 * fila queda como hoy (acciones hover). Kebab siempre visible en móvil.
 */
export function CorreoRowSwipe({
  thread,
  canModify,
  onOpen,
  onChanged,
  onRemove,
  onSnooze,
  selected,
  previewLines,
}: Props) {
  const [coarse, setCoarse] = useState(false);
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const startX = useRef(0);
  const dragging = useRef(false);

  useEffect(() => {
    setCoarse(typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  }, []);

  if (!coarse) {
    return (
      <CorreoRow
        thread={thread}
        canModify={canModify}
        onOpen={onOpen}
        onChanged={onChanged}
        selected={selected}
        previewLines={previewLines}
      />
    );
  }

  const menu = canModify ? (
    <CorreoRowMenu thread={thread} onChanged={onChanged} onRemove={onRemove} onSnooze={onSnooze} />
  ) : undefined;

  function commit(action: "archive" | "trash") {
    if (leaving) return;
    setLeaving(true);
    void runCorreoAction(
      thread.id,
      action,
      action === "archive" ? "Archivado" : "Movido a la Papelera",
      onChanged,
      "unarchive",
    );
    window.setTimeout(() => onRemove?.(thread.id), 200);
  }

  return (
    <div
      className={`relative overflow-hidden transition-all duration-200 ${
        leaving ? "max-h-0 opacity-0" : "max-h-[240px] opacity-100"
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-0 flex items-center justify-between px-5 ${
          dx >= 0 ? "bg-status-ok-soft" : "bg-status-danger-soft"
        }`}
      >
        <Archive className={`h-5 w-5 text-status-ok-fg ${dx > 0 ? "opacity-100" : "opacity-0"}`} />
        <Trash2
          className={`h-5 w-5 text-status-danger-fg ${dx < 0 ? "opacity-100" : "opacity-0"}`}
        />
      </div>
      <div
        className="relative bg-ds-surface-1"
        style={{ transform: `translateX(${dx}px)`, transition: dragging.current ? "none" : "transform 150ms" }}
        onTouchStart={(e) => {
          if (!canModify) return;
          startX.current = e.touches[0].clientX;
          dragging.current = true;
        }}
        onTouchMove={(e) => {
          if (!dragging.current) return;
          setDx(e.touches[0].clientX - startX.current);
        }}
        onTouchEnd={() => {
          dragging.current = false;
          if (dx > THRESHOLD) commit("archive");
          else if (dx < -THRESHOLD) commit("trash");
          setDx(0);
        }}
      >
        <CorreoRow
          thread={thread}
          canModify={canModify}
          onOpen={onOpen}
          onChanged={onChanged}
          trailing={menu}
          selected={selected}
          previewLines={previewLines}
        />
      </div>
    </div>
  );
}
