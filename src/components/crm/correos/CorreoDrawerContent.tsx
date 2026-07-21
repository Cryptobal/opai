"use client";

import { CheckCircle2, ExternalLink, Sparkles } from "lucide-react";
import { Tag } from "@/components/opai-ds";
import { CorreoAssociationBar } from "./CorreoAssociationBar";
import { CorreoMessages } from "./CorreoMessages";
import { CorreoAttachments } from "./CorreoAttachments";
import { LeadFromEmailPanel } from "./LeadFromEmailPanel";
import { SuggestedReplyPanel } from "./SuggestedReplyPanel";
import { CorreoThreadActions } from "./CorreoThreadActions";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";

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
  const gmailUrl = detail.thread.providerThreadId
    ? `https://mail.google.com/mail/u/0/#all/${detail.thread.providerThreadId}`
    : null;

  return (
    <>
      {canModify && (
        <CorreoThreadActions
          threadId={detail.thread.id}
          isUnread={detail.thread.isUnread}
          archived={Boolean(detail.thread.archivedAt)}
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
      <CorreoAssociationBar
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
      <SuggestedReplyPanel threadId={detail.thread.id} subject={detail.thread.subject} onSent={onRefresh} />
      <CorreoAttachments
        items={detail.attachments}
        threadId={detail.thread.id}
        dealId={detail.thread.dealId}
        dealTitle={detail.thread.dealTitle}
        accountId={detail.thread.accountId}
      />
      <CorreoMessages messages={detail.messages} />
    </>
  );
}
