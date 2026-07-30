"use client";

import { memo } from "react";
import { Paperclip, Star } from "lucide-react";
import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";
import { CorreoSenderAvatar } from "./CorreoSenderAvatar";
import { parseSender } from "./correo-sender";
import { PREVIEW_LINE_CLASS } from "./CorreoRow";
import type { CorreoPreviewLines } from "./useCorreosViewPreferences";
import { formatGmailDateChile } from "@/modules/crm/email/gmail-date-format";
import { CorreoMatchReasonBadge } from "./CorreoMatchReasonBadge";
import { CorreoTasksChip } from "./CorreoTasksChip";
import { tintBar, tintSoft } from "./MailboxSwitcher";

type Props = {
  thread: CorreoThreadDTO;
  onOpen: () => void;
  previewLines?: CorreoPreviewLines;
  /** Seleccionado en modo selección: fila teñida + avatar en check. */
  checked?: boolean;
  /** Tap en el avatar alterna la selección (estilo Gmail). */
  onAvatarPress?: () => void;
  /** Bandeja unificada: barra de color + chip de casilla. */
  unified?: boolean;
  mailboxColor?: string | null;
  mailboxLabel?: string | null;
};

/**
 * Fila móvil estilo Gmail: avatar + remitente/asunto/snippet +
 * hora (primary si no leído), clip si hay adjuntos y estrella.
 */
export const CorreoRowMobile = memo(function CorreoRowMobile({
  thread,
  onOpen,
  previewLines = 2,
  checked,
  onAvatarPress,
  unified = false,
  mailboxColor = null,
  mailboxLabel = null,
}: Props) {
  const unread = thread.isUnread;
  const compact = previewLines === 1;
  const subject = thread.subject || "(sin asunto)";
  const sender = parseSender(thread.fromEmail);
  const hasAttachments = thread.attachmentCount > 0;
  const showMailbox = unified && Boolean(mailboxColor || mailboxLabel);
  const hasDeal = Boolean(thread.dealId && thread.dealTitle);
  // Presupuesto de color: una marca máx junto a la hora (SLA > sin cuenta).
  const exceptionMark =
    thread.slaLevel === "danger"
      ? { label: thread.slaLabel ?? "!", tone: "danger" as const }
      : thread.slaLevel === "warn"
        ? { label: thread.slaLabel ?? "!", tone: "warn" as const }
        : !thread.accountId
          ? { label: "sin cuenta", tone: "warn" as const }
          : null;
  const line2 = hasDeal ? (
    <span className="min-w-0 truncate">{subject}</span>
  ) : (
    <>
      {thread.accountName && (
        <>
          <span className="max-w-[40%] shrink-0 truncate font-medium text-ds-text-3">
            {thread.accountName}
          </span>
          <span className="mx-1.5 shrink-0 text-ds-border-strong">·</span>
        </>
      )}
      <span className="min-w-0 truncate">{subject}</span>
    </>
  );
  const line3 = hasDeal ? (
    <span className="block truncate text-[13px] leading-5 text-ds-text-3">
      {[thread.accountName, thread.dealTitle].filter(Boolean).join(" › ")}
      {thread.dealStageName ? ` · ${thread.dealStageName}` : ""}
    </span>
  ) : !compact && thread.snippet ? (
    <span
      className={`block ${PREVIEW_LINE_CLASS[previewLines]} break-words text-[13px] leading-5 text-ds-text-3`}
    >
      {thread.snippet}
    </span>
  ) : null;

  return (
    <div
      data-correo-row={thread.id}
      data-correo-swipe-row=""
      onContextMenu={(e) => e.preventDefault()}
      className={`relative flex items-stretch gap-0 border-b border-ds-border-subtle pl-3 pr-4 ${
        compact ? "py-2" : "py-2.5"
      } ${checked ? "bg-primary/10" : ""}`}
    >
      {showMailbox && mailboxColor && (
        <span
          aria-hidden
          className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r ${tintBar(mailboxColor)}`}
        />
      )}
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
              className={`flex min-w-0 items-center gap-1.5 text-[14px] leading-5 ${
                unread ? "font-semibold text-ds-text-1" : "text-ds-text-2"
              }`}
            >
              <span className="min-w-0 truncate">
                {sender.name || sender.email || "—"}
              </span>
              {showMailbox && mailboxLabel && (
                <span
                  className={`inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[12px] font-medium ${
                    mailboxColor ? tintSoft(mailboxColor) : "bg-ds-surface-2 text-ds-text-3"
                  }`}
                >
                  {mailboxLabel}
                </span>
              )}
            </span>
            <span
              className={`flex min-w-0 items-baseline text-[13px] leading-5 ${
                unread ? "font-medium text-ds-text-1" : "text-ds-text-2"
              }`}
              title={subject}
            >
              {line2}
            </span>
            {line3}
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
            <span className="flex items-center gap-1">
              {exceptionMark && (
                <span
                  className={`text-[12px] font-medium leading-4 ${
                    exceptionMark.tone === "danger"
                      ? "text-status-danger-fg"
                      : "text-status-warn-fg"
                  }`}
                >
                  {exceptionMark.label}
                </span>
              )}
              <span
                className={`text-[12px] leading-4 ${
                  unread ? "font-medium text-primary" : "text-ds-text-4"
                }`}
              >
                {formatGmailDateChile(thread.lastMessageAt)}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <CorreoMatchReasonBadge reason={thread.matchReason} />
              {thread.openTaskCount > 0 && (
                <CorreoTasksChip
                  count={thread.openTaskCount}
                  level={thread.taskDueLevel}
                  onOpen={onOpen}
                  compact
                />
              )}
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
