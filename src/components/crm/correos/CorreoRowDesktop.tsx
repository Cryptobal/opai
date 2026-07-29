"use client";

import { Paperclip, Sparkles, Star } from "lucide-react";
import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";
import type { RadarCapability } from "@/modules/crm/email/radar-types";
import { CorreoCheckbox } from "./CorreoCheckbox";
import { CorreoSenderAvatar } from "./CorreoSenderAvatar";
import { parseSender } from "./correo-sender";
import { formatGmailDateChile } from "@/modules/crm/email/gmail-date-format";
import { CorreoThreadActions } from "./CorreoThreadActions";
import { CorreoMatchReasonBadge } from "./CorreoMatchReasonBadge";
import { CorreoVerticalDot } from "./CorreoVerticalDot";
import { CorreoActionChip } from "./CorreoActionChip";
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
  onRemoveDone?: () => void;
  onUndoDone?: () => void;
  /** Remoción optimista + avance (archivar/eliminar desde hover). */
  onRemove?: (id: string) => void;
  onSnooze?: () => void;
  /** Abre el menú de Acciones IA anclado a esta fila. */
  onAiMenu?: (anchor: { x: number; y: number }) => void;
  selected?: boolean;
  focused?: boolean;
  checked?: boolean;
  onToggleCheck?: () => void;
  previewLines?: CorreoPreviewLines;
  caps?: Set<RadarCapability>;
};

/**
 * Fila desktop densa estilo Gmail (40–44px, una línea): checkbox + estrella +
 * barra de vertical + avatar + remitente + cuenta·asunto — snippet + chip + hora.
 * El hover revela las acciones (CorreoThreadActions) superpuestas a la hora.
 * Densidad compacta (previewLines=1): 36px y sin avatar.
 */
export function CorreoRowDesktop({
  thread, onOpen, canModify, onChanged, onRemoveDone, onUndoDone, onRemove, onSnooze,
  onAiMenu,
  selected = false, focused = false, checked, onToggleCheck, previewLines = 2,
  caps = new Set(),
}: Props) {
  const unread = thread.isUnread;
  const compact = previewLines === 1;
  const subject = thread.subject || "(sin asunto)";
  const sender = parseSender(thread.fromEmail);
  const senderLabel = sender.name || sender.email || "—";
  const starred = Boolean(thread.starredAt);
  // Gmail Pro: fila activa (abierta o enfocada con j/k) con tint azulado.
  // El border-l siempre ocupa 2px (transparent) para no desplazar el contenido
  // al cambiar de fila — eso causaba el "tiritón" al archivar/navegar.
  const active = selected || focused;

  return (
    <div
      data-correo-row={thread.id}
      data-density={compact ? "compact" : "comfortable"}
      data-active={active ? "true" : undefined}
      className={`group relative flex w-full items-center gap-2 border-b border-l-2 border-ds-border-subtle pl-2 pr-3 last:border-b-0 ${
        compact ? "h-9" : "h-11"
      } ${
        selected
          ? "border-l-primary bg-primary/15 hover:bg-primary/20"
          : focused
            ? "border-l-primary/80 bg-primary/10 hover:bg-primary/15"
            : "border-l-transparent hover:bg-ds-surface-2"
      } ${unread && !active ? "bg-ds-surface-2/40" : ""} ${
        checked && !active ? "bg-primary/10" : ""
      }`}
    >
      {onToggleCheck && (
        <CorreoCheckbox
          checked={Boolean(checked)}
          onChange={onToggleCheck}
          ariaLabel={`Seleccionar ${subject}`}
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
      <CorreoVerticalDot
        vertical={thread.vertical}
        fixed={thread.verticalFixed}
        variant="bar"
      />
      {!compact && <CorreoSenderAvatar fromEmail={thread.fromEmail} compact />}
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected ? "true" : undefined}
        // El estado focused/selected ya pinta la fila; el ring global de
        // :focus-visible se veía como un borde naranja alrededor del mail.
        className="flex h-full min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
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
          {thread.accountName && (
            <>
              <span className="inline-block max-w-[130px] truncate align-bottom font-medium text-ds-text-3">
                {thread.accountName}
              </span>
              <span className="mx-1.5 text-ds-border-strong">·</span>
            </>
          )}
          <span className={unread ? "font-semibold text-ds-text-1" : "text-ds-text-2"}>
            {subject}
          </span>
          {thread.snippet && (
            <span className="text-ds-text-4"> — {thread.snippet}</span>
          )}
        </span>
      </button>
      <span className="flex shrink-0 items-center gap-1.5">
        <CorreoActionChip thread={thread} caps={caps} />
        <CorreoMatchReasonBadge reason={thread.matchReason} />
        {thread.attachmentCount > 0 && (
          <Paperclip aria-label={`${thread.attachmentCount} adjuntos`} className="h-3.5 w-3.5 text-ds-text-4" />
        )}
      </span>
      <span
        className={`w-24 flex-none text-right text-[12px] tabular-nums transition-opacity ${
          thread.snoozedUntil
            ? "text-status-warn-fg"
            : unread
              ? "font-semibold text-primary"
              : "text-ds-text-4"
        } ${canModify || onAiMenu ? "group-hover:opacity-0" : ""}`}
      >
        {thread.snoozedUntil
          ? `hasta ${snoozeShort(thread.snoozedUntil)}`
          : formatGmailDateChile(thread.lastMessageAt)}
      </span>
      <div className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center rounded-lg bg-ds-surface-2 pl-1 group-hover:flex">
        {onAiMenu && (
          <button
            type="button"
            aria-label="Acciones IA"
            title="Acciones IA"
            onClick={(e) => {
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onAiMenu({ x: rect.left, y: rect.bottom + 4 });
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-tint-violet-fg ds-tap hover:bg-tint-violet/10"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </button>
        )}
        {canModify && (
          <CorreoThreadActions
            threadId={thread.id}
            isUnread={unread}
            archived={Boolean(thread.archivedAt)}
            starred={Boolean(thread.starredAt)}
            inSpam={Boolean(thread.spamAt)}
            canModify={canModify}
            onDone={onChanged}
            onRemoveDone={onRemoveDone}
            onUndoDone={onUndoDone}
            onRemove={onRemove}
            onSnooze={onSnooze}
          />
        )}
      </div>
    </div>
  );
}
