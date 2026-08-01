"use client";

import { useState, type MouseEvent } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Tag } from "@/components/opai-ds";
import { confirmDialog } from "@/components/ui/confirm-service";
import { isCalendarMime } from "@/lib/ics";
import type { CorreoMessageDTO } from "@/modules/crm/email/correos.types";
import { EmailHtmlBody } from "./EmailHtmlBody";
import { CorreoAttachments } from "./CorreoAttachments";
import { CorreoInviteRsvpCard } from "./CorreoInviteRsvpCard";
import { CorreoMessageRecipients } from "./CorreoMessageRecipients";
import { CorreoQuotedHistory } from "./CorreoQuotedHistory";
import { CorreoSenderAvatar } from "./CorreoSenderAvatar";
import {
  allAttachmentsForMessage,
  attachmentsForMessage,
} from "./correo-attachments-scope";
import { discardGmailDraft } from "./correo-discard-draft";
import { splitMessageQuote } from "./correo-quoted-history";
import { formatMessageDateFull } from "./correo-message-format";
import { parseSender } from "./correo-sender";
import type { MessageImagePrefs, MessageSavePrefs } from "./correo-message-types";

/** Mensaje expandido de la cadena: cabecera, cuerpo, citado recortado y adjuntos. */
export function CorreoMessageOpen({
  m,
  onToggle,
  alwaysShowImages,
  onAlwaysShowImages,
  threadId,
  inSpam = false,
  canModify = false,
  attachments = [],
  dealId = null,
  dealTitle = null,
  accountId = null,
  accountName,
  mailboxEmail,
  degraded,
  onAttachmentsSaved,
  onRequestAssociate,
  renderMessageAttachments,
  onDraftDiscarded,
  onContinueDraft,
}: {
  m: CorreoMessageDTO;
  onToggle: () => void;
} & MessageImagePrefs &
  MessageSavePrefs) {
  const [discarding, setDiscarding] = useState(false);
  const isDraft = Boolean(m.isDraft);
  const sender = parseSender(m.fromEmail);
  const who =
    m.direction === "out"
      ? m.toEmails[0] || "—"
      : sender.name || sender.email || m.fromEmail || "—";
  // Listables (sin embeds cid) para paperclip/UI; todos (con cid) para el
  // rewrite de firmas e imágenes pegadas en el HTML del mensaje.
  const msgAttachments = attachmentsForMessage(attachments, m);
  const cidAttachments = allAttachmentsForMessage(attachments, m);
  // Historial citado embebido: fuera del cuerpo, tras el botón `•••`.
  const { bodyHtml, quotedHtml } = splitMessageQuote(m.htmlBody);
  const attachmentBlock =
    msgAttachments.length === 0
      ? null
      : renderMessageAttachments
        ? renderMessageAttachments(m, msgAttachments)
        : threadId
          ? (
            <CorreoAttachments
              items={msgAttachments}
              threadId={threadId}
              dealId={dealId}
              dealTitle={dealTitle}
              accountId={accountId}
              accountName={accountName}
              mailboxEmail={mailboxEmail}
              degraded={degraded}
              onSaved={onAttachmentsSaved}
              onRequestAssociate={onRequestAssociate}
              defaultOpen={false}
            />
          )
          : null;

  async function requestDiscardDraft(e?: MouseEvent) {
    e?.stopPropagation();
    if (!m.providerDraftId || discarding) return;
    const ok = await confirmDialog({
      title: "¿Descartar borrador?",
      description: "Se elimina el borrador y no se puede deshacer.",
      confirmLabel: "Descartar",
      cancelLabel: "Cancelar",
      variant: "destructive",
    });
    if (!ok) return;
    setDiscarding(true);
    try {
      const deleted = await discardGmailDraft(m.providerDraftId);
      if (!deleted) {
        toast.error("No se pudo descartar el borrador");
        return;
      }
      toast.message("Borrador descartado");
      onDraftDiscarded?.();
    } finally {
      setDiscarding(false);
    }
  }

  const showRsvp =
    Boolean(threadId) &&
    m.direction !== "out" &&
    Boolean(m.providerMessageId || m.id) &&
    (msgAttachments.some((a) => isCalendarMime(a.mimeType, a.filename)) ||
      /invitaci[oó]n|invitation|calendar|reunion|reunión|meeting|teams|aceptar|RSVP/i.test(
        `${m.subject || ""} ${m.textBody || ""}`,
      ) ||
      /teams\.microsoft\.com|meet\.google\.com|text\/calendar|\.ics/i.test(m.htmlBody || ""));

  return (
    <div
      data-correo-message
      data-correo-message-id={m.id}
      data-correo-draft={isDraft ? "true" : undefined}
      // min-w-0: el flex padre puede encoger la fila. Sin overflow-hidden: un
      // cuerpo HTML ensanchado debe poder expandir el scroller del lector.
      className="min-w-0"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded
        className="flex w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left ds-tap hover:bg-ds-surface-2"
      >
        <CorreoSenderAvatar fromEmail={m.fromEmail} photoUrl={m.fromPhotoUrl} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            {isDraft ? (
              <Tag variant="warn" size="sm">
                Borrador
              </Tag>
            ) : null}
            <span className="truncate text-[13px] font-semibold text-ds-text-1">
              {m.direction === "out" ? "Para: " : ""}
              {who}
            </span>
          </span>
          {!isDraft && (
            <span className="block truncate text-[12px] text-ds-text-4">
              {formatMessageDateFull(m.sentAt)}
            </span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ds-text-4" aria-hidden />
      </button>

      <div className="px-3 pb-3">
        <CorreoMessageRecipients
          m={m}
          threadId={threadId ?? ""}
          inSpam={inSpam}
          canModify={canModify}
        />
        {showRsvp && threadId ? (
          <CorreoInviteRsvpCard threadId={threadId} messageId={m.providerMessageId || m.id} />
        ) : null}
        <EmailHtmlBody
          htmlBody={bodyHtml}
          textBody={quotedHtml ? null : m.textBody}
          defaultShowImages={alwaysShowImages}
          onAlwaysShowImages={onAlwaysShowImages}
          threadId={threadId}
          messageId={m.providerMessageId || m.id}
          attachments={cidAttachments}
        />
        {quotedHtml ? (
          <CorreoQuotedHistory variant="reader" defaultExpanded={false}>
            <EmailHtmlBody
              htmlBody={quotedHtml}
              textBody={null}
              defaultShowImages={alwaysShowImages}
              onAlwaysShowImages={onAlwaysShowImages}
              threadId={threadId}
              messageId={m.providerMessageId || m.id}
              attachments={cidAttachments}
            />
          </CorreoQuotedHistory>
        ) : null}
        {attachmentBlock && (
          <div className="mt-2 border-t border-ds-border-subtle pt-2">{attachmentBlock}</div>
        )}
        {isDraft && m.providerDraftId ? (
          <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5 border-t border-ds-border-subtle pt-2">
            {onContinueDraft ? (
              <button
                type="button"
                onClick={() => onContinueDraft(m)}
                className="inline-flex h-10 items-center rounded-full px-3 text-[13px] font-medium text-ds-text-2 ds-tap hover:bg-ds-surface-2 sm:h-9"
              >
                Continuar
              </button>
            ) : null}
            <button
              type="button"
              title="Descartar borrador"
              aria-label="Descartar borrador"
              disabled={discarding}
              onClick={(e) => void requestDiscardDraft(e)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ds-text-3 ds-tap hover:bg-ds-surface-2 hover:text-status-danger-fg disabled:opacity-50 sm:h-9 sm:w-9"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
