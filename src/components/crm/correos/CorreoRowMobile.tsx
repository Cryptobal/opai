"use client";

import { Star } from "lucide-react";
import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";
import { CorreoSenderAvatar } from "./CorreoSenderAvatar";
import { parseSender } from "./correo-sender";
import { PREVIEW_LINE_CLASS, relativeTime } from "./CorreoRow";
import type { CorreoPreviewLines } from "./useCorreosViewPreferences";

type Props = {
  thread: CorreoThreadDTO;
  onOpen: () => void;
  previewLines?: CorreoPreviewLines;
  /** Seleccionado en modo selección: fila teñida + avatar en check. */
  checked?: boolean;
  /** Tap en el avatar alterna la selección (estilo Gmail). */
  onAvatarPress?: () => void;
};

/**
 * Fila móvil estilo Gmail: avatar de remitente + remitente/asunto/snippet +
 * hora (primary si no leído) y estrella. Sin checkbox, sin kebab y sin punto
 * de no leído — negrita + hora en color ya lo comunican. La selección vive
 * en el avatar y el long-press; el swipe la envuelve desde CorreoRowSwipe.
 */
export function CorreoRowMobile({
  thread,
  onOpen,
  previewLines = 2,
  checked,
  onAvatarPress,
}: Props) {
  const unread = thread.isUnread;
  const compact = previewLines === 1;
  const subject = thread.subject || "(sin asunto)";
  const sender = parseSender(thread.fromEmail);

  return (
    <div
      data-correo-row={thread.id}
      className={`flex items-start gap-3 border-b border-ds-border-subtle px-4 ${
        compact ? "py-2" : "py-2.5"
      } ${checked ? "bg-primary/10" : ""}`}
    >
      <CorreoSenderAvatar
        fromEmail={thread.fromEmail}
        compact={compact}
        checked={checked}
        onPress={onAvatarPress}
      />
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Abrir correo de ${sender.name || sender.email || "remitente"}: ${subject}`}
        className="flex min-w-0 flex-1 items-start gap-3 text-left ds-tap"
      >
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[14px] leading-5 ${
              unread ? "font-semibold text-ds-text-1" : "text-ds-text-2"
            }`}
          >
            {sender.name || sender.email || "—"}
          </span>
          <span
            className={`block truncate text-[13px] leading-5 ${
              unread ? "font-medium text-ds-text-1" : "text-ds-text-2"
            }`}
            title={subject}
          >
            {subject}
          </span>
          {!compact && thread.snippet && (
            <span
              className={`block ${PREVIEW_LINE_CLASS[previewLines]} break-words text-[13px] leading-5 text-ds-text-3`}
            >
              {thread.snippet}
            </span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
          <span
            className={`text-[12px] leading-4 ${
              unread ? "font-medium text-primary" : "text-ds-text-4"
            }`}
          >
            {relativeTime(thread.lastMessageAt)}
          </span>
          {thread.starredAt && (
            <Star
              className="h-4 w-4 fill-status-warn-fg text-status-warn-fg"
              aria-label="Destacado"
            />
          )}
        </span>
      </button>
    </div>
  );
}
