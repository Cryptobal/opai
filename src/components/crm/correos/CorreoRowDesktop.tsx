"use client";

import { Paperclip, Star } from "lucide-react";
import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";
import { CorreoSenderAvatar } from "./CorreoSenderAvatar";
import { parseSender } from "./correo-sender";
import { relativeTime } from "./CorreoRow";
import { CorreoThreadActions } from "./CorreoThreadActions";
import { runCorreoAction } from "./correo-thread-action-client";
import type { CorreoPreviewLines } from "./useCorreosViewPreferences";

function snoozeShort(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Santiago",
  });
}

type Props = {
  thread: CorreoThreadDTO;
  onOpen: () => void;
  canModify: boolean;
  onChanged?: () => void;
  onSnooze?: () => void;
  selected?: boolean;
  focused?: boolean;
  checked?: boolean;
  onToggleCheck?: () => void;
  previewLines?: CorreoPreviewLines;
};

/**
 * Fila desktop densa estilo Gmail (40–44px, una línea): checkbox + estrella +
 * avatar + remitente limpio + asunto — snippet inline + chips mini + hora.
 * El hover revela las acciones (CorreoThreadActions) superpuestas a la hora.
 * Densidad compacta (previewLines=1): 36px y sin avatar.
 */
export function CorreoRowDesktop({
  thread, onOpen, canModify, onChanged, onSnooze,
  selected = false, focused = false, checked, onToggleCheck, previewLines = 2,
}: Props) {
  const unread = thread.isUnread;
  const compact = previewLines === 1;
  const subject = thread.subject || "(sin asunto)";
  const sender = parseSender(thread.fromEmail);
  const senderLabel = sender.name || sender.email || "—";
  const starred = Boolean(thread.starredAt);

  return (
    <div
      data-correo-row={thread.id}
      data-density={compact ? "compact" : "comfortable"}
      className={`group relative flex w-full items-center gap-2 border-b border-ds-border-subtle pl-2 pr-3 last:border-0 hover:bg-ds-surface-2 ${
        compact ? "h-9" : "h-11"
      } ${selected ? "border-l-2 border-l-primary bg-primary/5" : ""} ${
        focused ? "ring-2 ring-inset ring-primary/60" : ""
      } ${unread && !selected ? "bg-ds-surface-2/40" : ""}`}
    >
      {onToggleCheck && (
        <input
          type="checkbox"
          checked={Boolean(checked)}
          onChange={onToggleCheck}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Seleccionar ${subject}`}
          className="h-4 w-4 shrink-0 cursor-pointer accent-[hsl(var(--primary))]"
        />
      )}
      {canModify && (
        <button
          type="button"
          title={starred ? "Quitar destacado" : "Destacar"}
          aria-label={starred ? "Quitar destacado" : "Destacar"}
          onClick={() =>
            void runCorreoAction(
              thread.id,
              starred ? "unstar" : "star",
              starred ? "Quitado de Destacados" : "Destacado",
              onChanged,
              starred ? "star" : "unstar",
            )
          }
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md ds-tap"
        >
          <Star
            className={`h-4 w-4 ${
              starred
                ? "fill-status-warn-fg text-status-warn-fg"
                : "text-ds-text-4 opacity-50 group-hover:opacity-100"
            }`}
          />
        </button>
      )}
      {!compact && <CorreoSenderAvatar fromEmail={thread.fromEmail} compact />}
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected ? "true" : undefined}
        className="flex h-full min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          className={`w-44 flex-none truncate text-[13px] ${
            unread ? "font-semibold text-ds-text-1" : "text-ds-text-2"
          }`}
        >
          {senderLabel}
          {thread.messageCount > 1 && (
            <span className="font-normal text-ds-text-4"> ({thread.messageCount})</span>
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px]" title={subject}>
          <span className={unread ? "font-semibold text-ds-text-1" : "text-ds-text-2"}>
            {subject}
          </span>
          {thread.snippet && (
            <span className="text-ds-text-4"> — {thread.snippet}</span>
          )}
        </span>
      </button>
      <span className="flex shrink-0 items-center gap-1.5">
        {thread.accountId ? (
          <span className="max-w-36 truncate rounded-full bg-primary/10 px-2 py-0.5 text-[12px] leading-4 text-primary">
            {thread.accountName || "Cuenta"}
          </span>
        ) : thread.possibleLead ? (
          <span className="rounded-full bg-status-warn-soft px-2 py-0.5 text-[12px] leading-4 text-status-warn-fg">
            Posible lead
          </span>
        ) : null}
        {thread.hasDraft && (
          <span className="rounded-full bg-status-warn-soft px-2 py-0.5 text-[12px] leading-4 text-status-warn-fg">
            Borrador
          </span>
        )}
        {thread.attachmentCount > 0 && (
          <Paperclip aria-label={`${thread.attachmentCount} adjuntos`} className="h-3.5 w-3.5 text-ds-text-4" />
        )}
      </span>
      <span
        className={`w-24 flex-none text-right text-[12px] tabular-nums ${
          thread.snoozedUntil
            ? "text-status-warn-fg"
            : unread
              ? "font-semibold text-primary"
              : "text-ds-text-4"
        } ${canModify ? "group-hover:invisible" : ""}`}
      >
        {thread.snoozedUntil
          ? `hasta ${snoozeShort(thread.snoozedUntil)}`
          : relativeTime(thread.lastMessageAt)}
      </span>
      {canModify && (
        <div className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center rounded-lg bg-ds-surface-2 pl-1 group-hover:flex">
          <CorreoThreadActions
            threadId={thread.id}
            isUnread={unread}
            archived={Boolean(thread.archivedAt)}
            canModify={canModify}
            onDone={onChanged}
            onSnooze={onSnooze}
          />
        </div>
      )}
    </div>
  );
}
