"use client";

import { memo } from "react";
import { Paperclip, Star } from "lucide-react";
import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";
import type { RadarCapability } from "@/modules/crm/email/radar-types";
import { CorreoSenderAvatar } from "./CorreoSenderAvatar";
import { parseSender } from "./correo-sender";
import { PREVIEW_LINE_CLASS } from "./CorreoRow";
import type { CorreoPreviewLines } from "./useCorreosViewPreferences";
import { formatGmailDateChile } from "@/modules/crm/email/gmail-date-format";
import { CorreoMatchReasonBadge } from "./CorreoMatchReasonBadge";
import { CorreoVerticalDot } from "./CorreoVerticalDot";
import { CorreoActionChip } from "./CorreoActionChip";

type Props = {
  thread: CorreoThreadDTO;
  onOpen: () => void;
  previewLines?: CorreoPreviewLines;
  /** Seleccionado en modo selección: fila teñida + avatar en check. */
  checked?: boolean;
  /** Tap en el avatar alterna la selección (estilo Gmail). */
  onAvatarPress?: () => void;
  caps?: Set<RadarCapability>;
};

/**
 * Fila móvil estilo Gmail: barra de vertical + avatar + remitente/asunto/snippet +
 * hora (primary si no leído), chip de acción, clip si hay adjuntos y estrella.
 */
export const CorreoRowMobile = memo(function CorreoRowMobile({
  thread,
  onOpen,
  previewLines = 2,
  checked,
  onAvatarPress,
  caps = new Set(),
}: Props) {
  const unread = thread.isUnread;
  const compact = previewLines === 1;
  const subject = thread.subject || "(sin asunto)";
  const sender = parseSender(thread.fromEmail);
  const hasAttachments = thread.attachmentCount > 0;

  return (
    <div
      data-correo-row={thread.id}
      data-correo-swipe-row=""
      onContextMenu={(e) => e.preventDefault()}
      className={`flex items-stretch gap-0 border-b border-ds-border-subtle pl-0 pr-4 ${
        compact ? "py-2" : "py-2.5"
      } ${checked ? "bg-primary/10" : ""}`}
    >
      <CorreoVerticalDot
        vertical={thread.vertical}
        fixed={thread.verticalFixed}
        variant="edge"
      />
      <span aria-hidden className="w-[9px] shrink-0" />
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <CorreoSenderAvatar
          fromEmail={thread.fromEmail}
          compact={compact}
          checked={checked}
          onPress={onAvatarPress}
        />
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Abrir correo de ${sender.name || sender.email || "remitente"}: ${subject}${
            hasAttachments ? ` (${thread.attachmentCount} adjuntos)` : ""
          }`}
          className="flex min-w-0 flex-1 items-start gap-3 text-left outline-none focus-visible:ring-0 focus-visible:ring-offset-0 ds-tap"
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
              className={`flex min-w-0 items-baseline text-[13px] leading-5 ${
                unread ? "font-medium text-ds-text-1" : "text-ds-text-2"
              }`}
              title={subject}
            >
              {thread.accountName && (
                <>
                  <span className="max-w-[40%] shrink-0 truncate font-medium text-ds-text-3">
                    {thread.accountName}
                  </span>
                  <span className="mx-1.5 shrink-0 text-ds-border-strong">·</span>
                </>
              )}
              <span className="min-w-0 truncate">{subject}</span>
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
              {formatGmailDateChile(thread.lastMessageAt)}
            </span>
            <CorreoActionChip thread={thread} caps={caps} />
            <span className="flex items-center gap-1.5">
              <CorreoMatchReasonBadge reason={thread.matchReason} />
              {hasAttachments && (
                <Paperclip
                  aria-label={`${thread.attachmentCount} adjuntos`}
                  className="h-3.5 w-3.5 text-ds-text-4"
                />
              )}
              {thread.starredAt && (
                <Star
                  className="h-4 w-4 fill-status-warn-fg text-status-warn-fg"
                  aria-label="Destacado"
                />
              )}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
});
