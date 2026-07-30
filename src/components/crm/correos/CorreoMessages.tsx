"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type {
  CorreoAttachmentDTO,
  CorreoMessageDTO,
} from "@/modules/crm/email/correos.types";
import { emailPlainFallback } from "@/lib/sanitize-email-html";
import { confirmDialog } from "@/components/ui/confirm-service";
import { Tag } from "@/components/opai-ds";
import { EmailHtmlBody } from "./EmailHtmlBody";
import { CorreoAttachments } from "./CorreoAttachments";
import { CorreoInviteRsvpCard } from "./CorreoInviteRsvpCard";
import { attachmentsForMessage } from "./correo-attachments-scope";
import { discardGmailDraft } from "./correo-discard-draft";
import { isCalendarMime } from "@/lib/ics";
import { parseSender } from "./correo-sender";
import {
  buildRecipientChips,
  summarizeRecipients,
  type RecipientChip,
} from "./message-recipients";
import { CorreoRecipientPopover } from "./CorreoRecipientPopover";

type RecipientActions = {
  threadId: string;
  inSpam: boolean;
  canModify: boolean;
};

function RecipientChipPill({
  chip,
  threadId,
  inSpam,
  canModify,
}: { chip: RecipientChip } & RecipientActions) {
  const email = chip.email || chip.raw;
  return (
    <CorreoRecipientPopover
      chip={chip}
      threadId={threadId}
      inSpam={inSpam}
      canModify={canModify}
    >
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex max-w-[min(100%,220px)] items-center gap-1.5 rounded-full border border-ds-border-subtle bg-ds-surface-2 px-2.5 py-1 text-[12px] text-ds-text-2 ds-tap transition-colors hover:border-ds-border-default hover:bg-ds-surface-3"
      >
        <span className="shrink-0 text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
          {chip.label === "Responder a" ? "R-To" : chip.label}
        </span>
        <span className="min-w-0 truncate font-medium">
          {chip.name || email.split("@")[0] || email}
        </span>
      </button>
    </CorreoRecipientPopover>
  );
}

/** Cabecera De/Para/CC: una línea colapsada; chips al expandir. */
function MessageRecipients({
  m,
  threadId,
  inSpam,
  canModify,
}: { m: CorreoMessageDTO } & RecipientActions) {
  const [expanded, setExpanded] = useState(false);
  const summary = summarizeRecipients(m);
  const chips = buildRecipientChips(m);
  const canExpand = chips.length > 1;

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => canExpand && setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={`flex w-full min-w-0 items-start gap-2 rounded-lg px-1 py-1 text-left ds-tap ${
          canExpand ? "hover:bg-ds-surface-2" : "cursor-default"
        }`}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex min-w-0 items-baseline gap-1.5 text-ds-body">
            <span className="shrink-0 text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
              De
            </span>
            <span className="truncate font-medium text-ds-text-1">{summary.from}</span>
          </div>
          {summary.line ? (
            <p className="truncate text-[12px] text-ds-text-3">{summary.line}</p>
          ) : null}
        </div>
        {canExpand ? (
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ds-text-4">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
        ) : null}
      </button>

      {expanded ? (
        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.map((chip) => (
            <RecipientChipPill
              key={`${chip.label}-${chip.email || chip.raw}`}
              chip={chip}
              threadId={threadId}
              inSpam={inSpam}
              canModify={canModify}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function snippet(m: CorreoMessageDTO): string {
  const plain = emailPlainFallback(m.htmlBody, m.textBody);
  return plain.replace(/\s+/g, " ").trim().slice(0, 120);
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }) : "";
}

type ImagePrefs = {
  alwaysShowImages?: boolean;
  onAlwaysShowImages?: () => void;
  threadId?: string | null;
  attachments?: CorreoAttachmentDTO[];
  inSpam?: boolean;
  canModify?: boolean;
};

type SavePrefs = {
  dealId?: string | null;
  dealTitle?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  mailboxEmail?: string | null;
  degraded?: boolean;
  onAttachmentsSaved?: () => void;
  onRequestAssociate?: () => void;
  /** Si se define, reemplaza el bloque CRM de adjuntos (p. ej. ficha entidad). */
  renderMessageAttachments?: (m: CorreoMessageDTO, items: CorreoAttachmentDTO[]) => ReactNode;
  /** Tras descartar un borrador en la cadena (refrescar detalle + lista). */
  onDraftDiscarded?: () => void;
  /** Continuar editando un borrador en el composer (estilo Gmail). */
  onContinueDraft?: (m: CorreoMessageDTO) => void;
};

/** Tarjeta de mensaje: cabecera siempre visible (tap = abrir/cerrar) + cuerpo. */
function MessageCard({
  m,
  open,
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
  open: boolean;
  onToggle: () => void;
} & ImagePrefs &
  SavePrefs) {
  const [discarding, setDiscarding] = useState(false);
  const isDraft = Boolean(m.isDraft);
  const sender = parseSender(m.fromEmail);
  const who =
    m.direction === "out"
      ? m.toEmails[0] || "—"
      : sender.name || sender.email || m.fromEmail || "—";
  const Chevron = open ? ChevronDown : ChevronRight;
  const msgAttachments = attachmentsForMessage(attachments, m);
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

  return (
    <div
      data-correo-message
      data-correo-draft={isDraft ? "true" : undefined}
      className={`overflow-hidden rounded-xl border bg-ds-surface-1 ${
        isDraft
          ? "border-status-warn-border/60 ring-1 ring-status-warn-border/30"
          : "border-ds-border-subtle"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2 px-3 py-2 text-left ds-tap hover:bg-ds-surface-2"
      >
        <Chevron className="mt-0.5 h-4 w-4 shrink-0 text-ds-text-4" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="flex min-w-0 items-center gap-1.5 truncate font-medium text-ds-text-2">
              {isDraft ? (
                <Tag variant="warn" size="sm">Borrador</Tag>
              ) : null}
              <span className="truncate">
                {m.direction === "out" ? "Para: " : ""}
                {who}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-ds-text-4">
              {!open && msgAttachments.length > 0 && (
                <span className="inline-flex items-center gap-0.5" title={`${msgAttachments.length} adjuntos`}>
                  <Paperclip className="h-3.5 w-3.5" />
                  <span className="tabular-nums">{msgAttachments.length}</span>
                </span>
              )}
              {isDraft ? null : fmtDate(m.sentAt)}
            </span>
          </div>
          {!open && <p className="truncate text-[12px] text-ds-text-4">{snippet(m)}</p>}
        </div>
      </button>
      {isDraft && m.providerDraftId && !open ? (
        <div className="flex justify-end gap-1 px-3 pb-2">
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
      {open && (
        <div className="border-t border-ds-border-subtle px-3 py-2">
          <MessageRecipients
            m={m}
            threadId={threadId ?? ""}
            inSpam={inSpam}
            canModify={canModify}
          />
          {threadId &&
          m.direction !== "out" &&
          (m.providerMessageId || m.id) &&
          (msgAttachments.some((a) => isCalendarMime(a.mimeType, a.filename)) ||
            /invitaci[oó]n|invitation|calendar|reunion|reunión|meeting|teams|aceptar|RSVP/i.test(
              `${m.subject || ""} ${m.textBody || ""}`,
            ) ||
            /teams\.microsoft\.com|meet\.google\.com|text\/calendar|\.ics/i.test(
              m.htmlBody || "",
            )) ? (
            <CorreoInviteRsvpCard
              threadId={threadId}
              messageId={m.providerMessageId || m.id}
            />
          ) : null}
          <EmailHtmlBody
            htmlBody={m.htmlBody}
            textBody={m.textBody}
            defaultShowImages={alwaysShowImages}
            onAlwaysShowImages={onAlwaysShowImages}
            threadId={threadId}
            messageId={m.providerMessageId || m.id}
            attachments={msgAttachments}
          />
          {attachmentBlock && (
            <div className="mt-2 border-t border-ds-border-subtle pt-2">{attachmentBlock}</div>
          )}
          {isDraft && m.providerDraftId ? (
            <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5 border-t border-ds-border-subtle pt-2">
              {onContinueDraft ? (
                <button
                  type="button"
                  onClick={() => onContinueDraft(m)}
                  className="inline-flex h-10 items-center rounded-full px-3 text-ds-body font-medium text-ds-text-2 ds-tap hover:bg-ds-surface-2 sm:h-9"
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
      )}
    </div>
  );
}

/** Cadena del hilo: por defecto el último abierto; adjuntos por mensaje. */
export function CorreoMessages({
  messages,
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
}: { messages: CorreoMessageDTO[] } & ImagePrefs & SavePrefs) {
  const lastId = messages[messages.length - 1]?.id;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(lastId ? [lastId] : []));
  if (messages.length === 0) {
    return <p className="text-ds-body text-ds-text-4">Sin mensajes.</p>;
  }
  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-2">
      {messages.map((m) => (
        <MessageCard
          key={m.id}
          m={m}
          open={expanded.has(m.id)}
          onToggle={() => toggle(m.id)}
          alwaysShowImages={alwaysShowImages}
          onAlwaysShowImages={onAlwaysShowImages}
          threadId={threadId}
          inSpam={inSpam}
          canModify={canModify}
          attachments={attachments}
          dealId={dealId}
          dealTitle={dealTitle}
          accountId={accountId}
          accountName={accountName}
          mailboxEmail={mailboxEmail}
          degraded={degraded}
          onAttachmentsSaved={onAttachmentsSaved}
          onRequestAssociate={onRequestAssociate}
          renderMessageAttachments={renderMessageAttachments}
          onDraftDiscarded={onDraftDiscarded}
          onContinueDraft={onContinueDraft}
        />
      ))}
    </div>
  );
}
