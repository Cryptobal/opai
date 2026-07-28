"use client";

import { useEffect, useState } from "react";
import { Briefcase, ExternalLink, Eye, Plus, Sparkles } from "lucide-react";
import { CorreoMessages } from "./CorreoMessages";
import { CorreoReplyBox } from "./CorreoReplyBox";
import { CorreoThreadActions } from "./CorreoThreadActions";
import { CorreoSummaryPanel } from "./CorreoSummaryPanel";
import { CorreoWorkPanel } from "./CorreoWorkPanel";
import { resolveWorkTab, type WorkTab } from "./work-panel-tabs";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";
import type { CorreoShortcuts } from "./useCorreosViewPreferences";
import type { ComposeIntent } from "./correo-reader-intent";

type Props = {
  detail: CorreoDetail;
  mailboxEmail?: string | null;
  canModify?: boolean;
  onOpenAiLead: () => void;
  onOpenAiMenu?: () => void;
  onAssociate: (p: { accountId: string | null; dealId: string | null; sharedWithAccount?: boolean }) => void;
  onRefresh: () => void;
  onClose?: () => void;
  onRemove?: (threadId: string) => void;
  onRemoveDone?: () => void;
  onUndoDone?: () => void;
  onReply?: () => void;
  onSnooze?: () => void;
  alwaysShowImages?: boolean;
  onAlwaysShowImages?: () => void;
  shortcuts?: CorreoShortcuts;
  /** Abrir panel en una pestaña (menú contextual / deep-link). */
  workTabIntent?: { tab: WorkTab; nonce: number } | null;
  composeIntent?: ComposeIntent | null;
};

export function CorreoDrawerContent({
  detail,
  mailboxEmail,
  canModify,
  onOpenAiLead,
  onOpenAiMenu,
  onAssociate,
  onRefresh,
  onClose,
  onRemove,
  onRemoveDone,
  onUndoDone,
  onReply,
  onSnooze,
  alwaysShowImages,
  onAlwaysShowImages,
  shortcuts,
  workTabIntent = null,
  composeIntent = null,
}: Props) {
  const t = detail.thread;
  const [panel, setPanel] = useState<{ tab: WorkTab } | null>(null);
  const gmailUrl = t.providerThreadId ? `https://mail.google.com/mail/u/0/#all/${t.providerThreadId}` : null;

  useEffect(() => {
    if (!workTabIntent) return;
    setPanel({ tab: resolveWorkTab(workTabIntent.tab) });
    // nonce garantiza re-apertura aunque sea la misma pestaña.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workTabIntent?.nonce]);

  const openPanel = (tab: WorkTab) => setPanel({ tab: resolveWorkTab(tab) });

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="shrink-0 space-y-2 border-b border-ds-border-subtle bg-background pb-3 lg:bg-ds-surface-2">
        {canModify && (
          <div className="hidden flex-wrap items-center gap-2 lg:flex">
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
              onRemoveDone={onRemoveDone}
              onUndoDone={onUndoDone}
              onClose={onClose}
              onRemove={onRemove}
              onReply={onReply}
              onSnooze={onSnooze}
            />
            {gmailUrl && (
              <a
                href={gmailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-[12px] text-primary ds-tap"
              >
                Abrir en Gmail <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}

        {!canModify && gmailUrl && (
          <div className="flex justify-end">
            <a
              href={gmailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12px] text-primary ds-tap"
            >
              Abrir en Gmail <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        {/* Chips CRM + IA en UNA sola fila (sin segunda línea de botones). */}
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
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-dashed border-ds-border-default bg-ds-surface-1 px-2.5 text-[12px] text-ds-text-3 ds-tap"
            >
              <Plus className="h-3.5 w-3.5" /> Sin cuenta · Asociar
            </button>
          )}
          <button
            type="button"
            onClick={() => openPanel("productividad")}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-ds-border-default bg-ds-surface-1 px-2.5 text-[12px] font-medium text-ds-text-1 ds-tap hover:border-primary"
          >
            <Briefcase className="h-3.5 w-3.5 text-tint-violet-fg" /> Panel de trabajo
          </button>
          {onOpenAiMenu && (
            <button
              type="button"
              onClick={onOpenAiMenu}
              aria-label="Acciones IA"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-tint-violet/30 bg-tint-violet/10 px-2.5 text-[12px] font-medium text-tint-violet-fg ds-tap lg:hidden"
            >
              <Sparkles className="h-3.5 w-3.5" /> IA
            </button>
          )}
          <CorreoSummaryPanel key={`summary-${t.id}`} threadId={t.id} variant="inline" />
        </div>
      </div>

      {detail.degraded && (
        <div className="shrink-0 rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2.5 text-[13px] text-status-warn-fg">
          No se pudieron cargar los adjuntos de este hilo desde Gmail. Reintentá en unos segundos.
        </div>
      )}

      <div className="min-w-0 space-y-2">
        <CorreoMessages
          messages={detail.messages}
          alwaysShowImages={alwaysShowImages}
          onAlwaysShowImages={onAlwaysShowImages}
          threadId={t.id}
          attachments={detail.attachments}
          dealId={t.dealId}
          dealTitle={t.dealTitle}
          accountId={t.accountId}
          accountName={t.accountName}
          mailboxEmail={mailboxEmail}
          degraded={detail.degraded}
          onAttachmentsSaved={onRefresh}
          onRequestAssociate={() => openPanel("cuenta")}
        />
        <CorreoReplyBox
          key={`reply-${t.id}`}
          detail={detail}
          onSent={onRefresh}
          shortcuts={shortcuts}
          composeIntent={composeIntent}
        />
      </div>

      <CorreoWorkPanel
        open={panel !== null}
        initialTab={panel?.tab ?? "resumen"}
        detail={detail}
        onOpenAiLead={onOpenAiLead}
        onAssociate={onAssociate}
        onRefresh={onRefresh}
        onClose={() => {
          setPanel(null);
        }}
      />
    </div>
  );
}
