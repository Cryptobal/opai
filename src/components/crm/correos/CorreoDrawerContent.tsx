"use client";

import { useEffect, useState } from "react";
import { Briefcase, ExternalLink, Eye, Plus } from "lucide-react";
import { CorreoMessages } from "./CorreoMessages";
import { CorreoAttachments } from "./CorreoAttachments";
import { CorreoReplyBox } from "./CorreoReplyBox";
import { CorreoThreadActions } from "./CorreoThreadActions";
import { CorreoSummaryPanel } from "./CorreoSummaryPanel";
import { CorreoWorkPanel } from "./CorreoWorkPanel";
import type { WorkTab } from "./work-panel-tabs";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";

type Props = {
  detail: CorreoDetail;
  mailboxEmail?: string | null;
  canModify?: boolean;
  aiOpen: boolean;
  setAiOpen: (v: boolean) => void;
  onAssociate: (p: { accountId: string | null; dealId: string | null; sharedWithAccount?: boolean }) => void;
  onRefresh: () => void;
  onClose?: () => void;
  onReply?: () => void;
  onSnooze?: () => void;
  alwaysShowImages?: boolean;
  onAlwaysShowImages?: () => void;
};

export function CorreoDrawerContent({
  detail,
  mailboxEmail,
  canModify,
  aiOpen,
  setAiOpen,
  onAssociate,
  onRefresh,
  onClose,
  onReply,
  onSnooze,
  alwaysShowImages,
  onAlwaysShowImages,
}: Props) {
  const t = detail.thread;
  const [panel, setPanel] = useState<{ tab: WorkTab } | null>(null);
  const gmailUrl = t.providerThreadId ? `https://mail.google.com/mail/u/0/#all/${t.providerThreadId}` : null;

  // Posible lead (autoExtract) o "Crear lead con IA": abre el panel en Resumen.
  useEffect(() => {
    if (aiOpen) setPanel({ tab: "resumen" });
  }, [aiOpen]);

  const openPanel = (tab: WorkTab) => setPanel({ tab });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {canModify && (
          <CorreoThreadActions
            threadId={t.id}
            isUnread={t.isUnread}
            archived={Boolean(t.archivedAt)}
            starred={Boolean(t.starredAt)}
            inSpam={Boolean(t.spamAt)}
            canModify
            variant="drawer"
            compact
            onDone={onRefresh}
            onClose={onClose}
            onReply={onReply}
            onSnooze={onSnooze}
          />
        )}
        {gmailUrl && (
          <a href={gmailUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-[12px] text-primary ds-tap">
            Abrir en Gmail <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Chips contextuales del hilo: estado + entrada al Panel de trabajo. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {t.accountId ? (
          <button
            type="button"
            onClick={() => openPanel("cuenta")}
            className="inline-flex min-h-8 items-center gap-1 rounded-full border border-ds-border-default bg-ds-surface-1 px-2.5 text-[12px] text-ds-text-1 ds-tap"
          >
            {t.sharedWithAccount && <Eye className="h-3.5 w-3.5 text-status-ok-fg" />}
            <span className="max-w-[12rem] truncate">{t.accountName || "Cuenta"}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => openPanel("cuenta")}
            className="inline-flex min-h-8 items-center gap-1 rounded-full border border-dashed border-ds-border-default px-2.5 text-[12px] text-ds-text-3 ds-tap"
          >
            <Plus className="h-3.5 w-3.5" /> Sin cuenta · Asociar
          </button>
        )}
        <button
          type="button"
          onClick={() => openPanel("resumen")}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-ds-border-default bg-ds-surface-1 px-2.5 text-[12px] font-medium text-ds-text-1 ds-tap hover:border-primary"
        >
          <Briefcase className="h-3.5 w-3.5 text-tint-violet-fg" /> Panel de trabajo
        </button>
      </div>

      {/* A01/A02: Resumir hilo — acceso rápido. */}
      <CorreoSummaryPanel key={`summary-${t.id}`} threadId={t.id} />
      {detail.degraded && (
        <div className="rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2.5 text-[13px] text-status-warn-fg">
          No se pudieron cargar los adjuntos de este hilo desde Gmail. Reintentá en unos segundos.
        </div>
      )}

      {/* EL CORREO al frente. */}
      <CorreoMessages messages={detail.messages} alwaysShowImages={alwaysShowImages} onAlwaysShowImages={onAlwaysShowImages} />
      <CorreoAttachments
        items={detail.attachments}
        threadId={t.id}
        dealId={t.dealId}
        dealTitle={t.dealTitle}
        accountId={t.accountId}
        accountName={t.accountName}
        mailboxEmail={mailboxEmail}
        degraded={detail.degraded}
        onSaved={onRefresh}
        onRequestAssociate={() => openPanel("cuenta")}
      />

      {/* Responder — barra Gmail / composer bajo demanda. Nada debajo (el panel
          de trabajo es slide-over, no inline). */}
      <CorreoReplyBox key={`reply-${t.id}`} detail={detail} onSent={onRefresh} />

      <CorreoWorkPanel
        open={panel !== null}
        initialTab={panel?.tab ?? "resumen"}
        detail={detail}
        aiOpen={aiOpen}
        setAiOpen={setAiOpen}
        onAssociate={onAssociate}
        onRefresh={onRefresh}
        onClose={() => {
          setPanel(null);
          setAiOpen(false);
        }}
      />
    </>
  );
}
