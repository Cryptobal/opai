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
  onRemoveDone,
  onUndoDone,
  onRemove,
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
  onRemoveDone?: () => void;
  onUndoDone?: () => void;
  /** Remoción optimista + avance (archivar/eliminar). */
  onRemove?: (id: string) => void;
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
      onRemoveDone={onRemoveDone}
      onUndoDone={onUndoDone}
      onRemove={onRemove}
      onSnooze={onSnooze}
      selected={selected}
      focused={focused}
      checked={checked}
      onToggleCheck={onToggleCheck}
      previewLines={previewLines}
    />
  );
}
