"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, Forward, Sparkles, X } from "lucide-react";
import { Tag } from "@/components/opai-ds";
import { CorreoAssociationBar } from "./CorreoAssociationBar";
import { CorreoMessages } from "./CorreoMessages";
import { CorreoAttachments } from "./CorreoAttachments";
import { CorreoTasksPanel } from "./CorreoTasksPanel";
import { LeadFromEmailPanel } from "./LeadFromEmailPanel";
import { SuggestedReplyPanel } from "./SuggestedReplyPanel";
import { CorreoThreadActions } from "./CorreoThreadActions";
import { CorreoContactPanel } from "./CorreoContactPanel";
import { CorreoSummaryPanel } from "./CorreoSummaryPanel";
import { CorreoLinksPanel } from "./CorreoLinksPanel";
import { EmailComposer } from "./EmailComposer";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";

/** HTML citado del último mensaje del hilo para reenviar (C13). */
function buildForwardQuote(detail: CorreoDetail): string {
  const last = detail.messages[detail.messages.length - 1];
  if (!last) return "";
  const meta = [
    `De: ${last.fromEmail}`,
    last.sentAt ? `Fecha: ${new Date(last.sentAt).toLocaleString("es-CL")}` : null,
    `Asunto: ${last.subject}`,
    `Para: ${last.toEmails.join(", ")}`,
  ]
    .filter(Boolean)
    .join("<br>");
  const body =
    last.htmlBody ??
    (last.textBody
      ? last.textBody
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>")
      : "");
  return `${meta}<br><br>${body}`;
}

type Props = {
  detail: CorreoDetail;
  canModify?: boolean;
  aiOpen: boolean;
  setAiOpen: (v: boolean) => void;
  onAssociate: (p: { accountId: string | null; dealId: string | null }) => void;
  onRefresh: () => void;
  onClose?: () => void;
  onReply?: () => void;
  onSnooze?: () => void;
};

export function CorreoDrawerContent({
  detail,
  canModify,
  aiOpen,
  setAiOpen,
  onAssociate,
  onRefresh,
  onClose,
  onReply,
  onSnooze,
}: Props) {
  const [forwardOpen, setForwardOpen] = useState(false);
  const gmailUrl = detail.thread.providerThreadId
    ? `https://mail.google.com/mail/u/0/#all/${detail.thread.providerThreadId}`
    : null;
  const forwardSubject = detail.thread.subject.toLowerCase().startsWith("fwd:")
    ? detail.thread.subject
    : `Fwd: ${detail.thread.subject}`;

  return (
    <>
      {canModify && (
        <CorreoThreadActions
          threadId={detail.thread.id}
          isUnread={detail.thread.isUnread}
          archived={Boolean(detail.thread.archivedAt)}
          starred={Boolean(detail.thread.starredAt)}
          inSpam={Boolean(detail.thread.spamAt)}
          canModify
          variant="drawer"
          onDone={onRefresh}
          onClose={onClose}
          onReply={onReply}
          onSnooze={onSnooze}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {detail.thread.accountId ? (
          <Tag variant="brand" size="sm">{detail.thread.accountName || "Cuenta"}</Tag>
        ) : (
          <Tag variant="neutral" size="sm">Sin asociar</Tag>
        )}
        {detail.thread.dealId && (
          <Tag variant="info" size="sm">Negocio · {detail.thread.dealTitle || "—"}</Tag>
        )}
        {gmailUrl && (
          <a href={gmailUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-[12px] text-primary ds-tap">
            Abrir en Gmail <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {/* Orden estilo Gmail: correo → adjuntos (plegados) → acciones CRM →
          respuesta al final. */}
      {detail.degraded && (
        <div className="rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2.5 text-[13px] text-status-warn-fg">
          No se pudieron cargar los adjuntos de este hilo desde Gmail. Reintentá
          en unos segundos.
        </div>
      )}
      {/* P11: ficha del contacto asociado + últimas conversaciones. */}
      <CorreoContactPanel key={`contact-${detail.thread.id}`} threadId={detail.thread.id} />
      {/* A01/A02: resúmenes on-demand del hilo. */}
      <CorreoSummaryPanel key={`summary-${detail.thread.id}`} threadId={detail.thread.id} />
      {/* O01-O04: panel operacional — entidades vinculadas + sugerencia IA. */}
      <CorreoLinksPanel key={`links-${detail.thread.id}`} threadId={detail.thread.id} />
      <CorreoMessages messages={detail.messages} />
      <CorreoAttachments
        items={detail.attachments}
        threadId={detail.thread.id}
        dealId={detail.thread.dealId}
        dealTitle={detail.thread.dealTitle}
        accountId={detail.thread.accountId}
      />
      <CorreoAssociationBar
        threadId={detail.thread.id}
        accountId={detail.thread.accountId}
        accountName={detail.thread.accountName}
        dealId={detail.thread.dealId}
        dealTitle={detail.thread.dealTitle}
        subject={detail.thread.subject}
        onAssociate={onAssociate}
      />
      {detail.thread.leadId ? (
        <div className="flex items-center gap-2 rounded-xl border border-status-ok-border bg-status-ok-soft p-2.5 text-[13px] text-status-ok-fg">
          <CheckCircle2 className="h-4 w-4" /> Lead creado desde este correo.
        </div>
      ) : aiOpen ? (
        <LeadFromEmailPanel
          threadId={detail.thread.id}
          hasAccount={Boolean(detail.thread.accountId)}
          onClose={() => setAiOpen(false)}
          onCreated={() => { setAiOpen(false); onRefresh(); }}
        />
      ) : (
        <button type="button" onClick={() => setAiOpen(true)} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[13px] font-medium text-primary-foreground ds-tap">
          <Sparkles className="h-4 w-4" /> Crear lead con IA
        </button>
      )}
      <CorreoTasksPanel key={`tasks-${detail.thread.id}`} threadId={detail.thread.id} subject={detail.thread.subject} />
      {/* key: resetea asunto/borrador al cambiar de hilo. */}
      <SuggestedReplyPanel key={detail.thread.id} threadId={detail.thread.id} subject={detail.thread.subject} onSent={onRefresh} />

      {/* C13: reenviar con adjuntos originales re-adjuntados desde Gmail. */}
      {forwardOpen ? (
        <div className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Forward className="h-4 w-4 text-tint-violet-fg" />
              <p className="text-[13px] font-semibold text-ds-text-1">Reenviar</p>
            </div>
            <button type="button" aria-label="Cerrar reenvío" onClick={() => setForwardOpen(false)} className="text-ds-text-3 ds-tap">
              <X className="h-4 w-4" />
            </button>
          </div>
          <EmailComposer
            key={`fwd-${detail.thread.id}`}
            mode="forward"
            initialSubject={forwardSubject}
            quotedHtml={buildForwardQuote(detail)}
            forwardFromThreadId={detail.thread.id}
            forwardAttachments={detail.attachments.map((a) => ({
              providerMessageId: a.messageId,
              attachmentId: a.attachmentId,
              fileName: a.filename,
              size: a.size,
            }))}
            accountId={detail.thread.accountId}
            dealId={detail.thread.dealId}
            onSent={onRefresh}
            onClose={() => setForwardOpen(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setForwardOpen(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-ds-border-default px-3 text-[13px] ds-tap sm:h-9"
        >
          <Forward className="h-4 w-4" /> Reenviar
        </button>
      )}
    </>
  );
}
