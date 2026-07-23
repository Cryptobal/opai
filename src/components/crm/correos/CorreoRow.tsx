"use client";

import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";
import { CorreoRowDesktop } from "./CorreoRowDesktop";
import { CorreoRowMobile } from "./CorreoRowMobile";
import type { CorreoPreviewLines } from "./useCorreosViewPreferences";

// Compartidos por las variantes móvil (clamp del snippet) y desktop (hora).
export const PREVIEW_LINE_CLASS: Record<CorreoPreviewLines, string> = {
  1: "line-clamp-1",
  2: "line-clamp-2",
  3: "line-clamp-3",
};

export function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

/**
 * Fila de correo — dispatcher de variantes: móvil Gmail (avatar + swipe,
 * activada por CorreoRowSwipe en pointer coarse) o desktop densa (una línea,
 * hover actions). El layout desktop antiguo (multi-línea con tags grandes)
 * fue reemplazado por CorreoRowDesktop.
 */
export function CorreoRow({
  thread,
  onOpen,
  canModify,
  onChanged,
  onSnooze,
  selected = false,
  focused = false,
  checked,
  onToggleCheck,
  previewLines = 2,
  mobileGmail = false,
  onAvatarPress,
}: {
  thread: CorreoThreadDTO;
  onOpen: () => void;
  canModify: boolean;
  onChanged?: () => void;
  /** Abre el sheet de posponer (hover desktop / swipe móvil). */
  onSnooze?: () => void;
  selected?: boolean;
  /** Fila enfocada por navegación j/k (C20). */
  focused?: boolean;
  /** Multi-select (C12): estado del checkbox; undefined = sin checkbox. */
  checked?: boolean;
  onToggleCheck?: () => void;
  previewLines?: CorreoPreviewLines;
  /** Variante móvil estilo Gmail (avatar, sin checkbox ni kebab). */
  mobileGmail?: boolean;
  /** Tap en el avatar alterna selección (solo variante móvil). */
  onAvatarPress?: () => void;
}) {
  if (mobileGmail) {
    return (
      <CorreoRowMobile
        thread={thread}
        onOpen={onOpen}
        previewLines={previewLines}
        checked={checked}
        onAvatarPress={onAvatarPress}
      />
    );
  }

  return (
    <CorreoRowDesktop
      thread={thread}
      onOpen={onOpen}
      canModify={canModify}
      onChanged={onChanged}
      onSnooze={onSnooze}
      selected={selected}
      focused={focused}
      checked={checked}
      onToggleCheck={onToggleCheck}
      previewLines={previewLines}
    />
  );
}
