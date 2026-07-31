"use client";

import { Paperclip } from "lucide-react";
import { Tag } from "@/components/opai-ds";
import type { CorreoMessageDTO } from "@/modules/crm/email/correos.types";
import { CorreoSenderAvatar } from "./CorreoSenderAvatar";
import { parseSender } from "./correo-sender";
import {
  formatMessageDateFull,
  formatMessageDateShort,
  messageSnippet,
} from "./correo-message-format";

type Props = {
  m: CorreoMessageDTO;
  /** Adjuntos listables del mensaje (clip + contador). */
  attachmentCount: number;
  unread?: boolean;
  onOpen: () => void;
};

/**
 * Fila colapsada de la cadena (una línea, estilo Gmail): avatar de remitente,
 * quién, snippet, clip con contador y fecha corta. Tap = abrir el mensaje.
 * No monta el HTML del cuerpo.
 */
export function CorreoMessageRow({ m, attachmentCount, unread = false, onOpen }: Props) {
  const isDraft = Boolean(m.isDraft);
  const sender = parseSender(m.fromEmail);
  const who =
    m.direction === "out" ? "yo" : sender.name || sender.email || m.fromEmail || "—";
  const full = formatMessageDateFull(m.sentAt);

  return (
    <button
      type="button"
      data-correo-message
      data-correo-message-id={m.id}
      data-correo-draft={isDraft ? "true" : undefined}
      onClick={onOpen}
      aria-expanded={false}
      className="flex min-h-[52px] w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left ds-tap hover:bg-ds-surface-2"
    >
      <CorreoSenderAvatar fromEmail={m.fromEmail} compact />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          {isDraft ? (
            <Tag variant="warn" size="sm">
              Borrador
            </Tag>
          ) : null}
          <span
            className={`truncate text-[13px] ${
              unread ? "font-semibold text-ds-text-1" : "font-medium text-ds-text-2"
            }`}
          >
            {who}
          </span>
        </span>
        <span className="truncate text-[12px] text-ds-text-4">{messageSnippet(m)}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-ds-text-4">
        {attachmentCount > 0 && (
          <span
            className="inline-flex items-center gap-0.5"
            title={`${attachmentCount} adjuntos`}
          >
            <Paperclip className="h-3.5 w-3.5" />
            <span className="tabular-nums">{attachmentCount}</span>
          </span>
        )}
        {isDraft ? null : (
          <span className="tabular-nums" title={full}>
            {formatMessageDateShort(m.sentAt)}
          </span>
        )}
      </span>
    </button>
  );
}
