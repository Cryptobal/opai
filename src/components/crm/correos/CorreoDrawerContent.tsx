"use client";

import { useEffect, useRef, useState } from "react";
import {
  Building2,
  ExternalLink,
  Eye,
  History,
  MoreHorizontal,
  Plus,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/opai-ds";
import { CorreoMessages } from "./CorreoMessages";
import { CorreoReplyBox } from "./CorreoReplyBox";
import { CorreoThreadActions } from "./CorreoThreadActions";
import { CorreoWorkPanel } from "./CorreoWorkPanel";
import { CorreoVerdictStrip } from "./CorreoVerdictStrip";
import { resolveWorkTab, type WorkTab } from "./work-panel-tabs";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";
import type { CorreoAiCommandId } from "@/modules/crm/email/correo-ai-commands";
import type { CorreoShortcuts } from "./useCorreosViewPreferences";
import type { ComposeIntent } from "./correo-reader-intent";

type Props = {
  detail: CorreoDetail;
  mailboxEmail?: string | null;
  canModify?: boolean;
  onOpenAiLead: () => void;
  onAiCommand?: (commandId: CorreoAiCommandId) => void;
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

type SummaryState = {
  mode: "full" | "since-read";
  summary: string;
  cached: boolean;
} | null;

export function CorreoDrawerContent({
  detail,
  mailboxEmail,
  canModify,
  onOpenAiLead,
  onAiCommand,
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
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [summaryBusy, setSummaryBusy] = useState<"full" | "since-read" | null>(null);
  const [summary, setSummary] = useState<SummaryState>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const gmailUrl = t.providerThreadId
    ? `https://mail.google.com/mail/u/0/#all/${t.providerThreadId}`
    : null;

  useEffect(() => {
    if (!workTabIntent) return;
    setPanel({ tab: resolveWorkTab(workTabIntent.tab) });
    // nonce garantiza re-apertura aunque sea la misma pestaña.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workTabIntent?.nonce]);

  useEffect(() => {
    setSummary(null);
    setSummaryBusy(null);
    setOverflowOpen(false);
  }, [t.id]);

  useEffect(() => {
    if (!overflowOpen) return;
    function onDoc(e: MouseEvent) {
      if (overflowRef.current?.contains(e.target as Node)) return;
      setOverflowOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOverflowOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [overflowOpen]);

  const openPanel = (tab: WorkTab) => setPanel({ tab: resolveWorkTab(tab) });

  async function runSummary(mode: "full" | "since-read") {
    setOverflowOpen(false);
    setSummaryBusy(mode);
    try {
      const res = await fetch(`/api/crm/correos/${t.id}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        summary?: string;
        cached?: boolean;
        error?: string;
      };
      if (!res.ok || !data.summary) {
        toast.error(data.error || "No se pudo resumir el hilo");
        return;
      }
      setSummary({ mode, summary: data.summary, cached: Boolean(data.cached) });
    } catch {
      toast.error("No se pudo resumir el hilo");
    } finally {
      setSummaryBusy(null);
    }
  }

  const contextLabel = t.accountId
    ? [t.accountName || "Cuenta", t.dealTitle].filter(Boolean).join(" · ")
    : null;

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
          </div>
        )}

        {/* Una sola fila: contexto · Copiloto · overflow */}
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => openPanel("cuenta")}
            className="inline-flex min-h-11 min-w-0 max-w-[46%] shrink items-center gap-1 rounded-full border border-ds-border-default bg-ds-surface-1 px-2.5 text-[12px] text-ds-text-1 ds-tap sm:min-h-8"
          >
            {t.accountId ? (
              <>
                {t.sharedWithAccount && <Eye className="h-3.5 w-3.5 shrink-0 text-status-ok-fg" />}
                <Building2 className="h-3.5 w-3.5 shrink-0 text-ds-text-3" />
                <span className="truncate">{contextLabel}</span>
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">+ Asociar</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => openPanel("resumen")}
            aria-label="Copiloto"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-tint-violet/30 bg-tint-violet/10 px-2.5 text-[12px] font-medium text-tint-violet-fg ds-tap sm:min-h-8"
          >
            <Sparkles className="h-3.5 w-3.5" /> ✦ Copiloto
          </button>

          <div ref={overflowRef} className="relative ml-auto shrink-0">
            <button
              type="button"
              aria-label="Más acciones"
              aria-expanded={overflowOpen}
              onClick={() => setOverflowOpen((o) => !o)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-ds-border-default bg-ds-surface-1 text-ds-text-2 ds-tap sm:h-8 sm:w-8"
            >
              {summaryBusy ? <Spinner className="h-3.5 w-3.5" /> : <MoreHorizontal className="h-4 w-4" />}
            </button>
            {overflowOpen && (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-ds-border-default bg-ds-surface-1 py-1 shadow-ds-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={summaryBusy !== null}
                  onClick={() => void runSummary("full")}
                  className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2 disabled:opacity-50 sm:min-h-9"
                >
                  <ScrollText className="h-4 w-4 text-ds-text-3" /> Resumir
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={summaryBusy !== null}
                  onClick={() => void runSummary("since-read")}
                  className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2 disabled:opacity-50 sm:min-h-9"
                >
                  <History className="h-4 w-4 text-ds-text-3" /> Desde lectura
                </button>
                {gmailUrl && (
                  <a
                    role="menuitem"
                    href={gmailUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOverflowOpen(false)}
                    className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2 sm:min-h-9"
                  >
                    <ExternalLink className="h-4 w-4 text-ds-text-3" /> Abrir en Gmail
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        <CorreoVerdictStrip
          data={{
            aiCategory: t.aiCategory,
            aiSummary: t.aiSummary,
            aiUrgency: t.aiUrgency,
            aiClassifiedAt: t.aiClassifiedAt,
            lastMessageAt: t.lastMessageAt,
            dealFechaEntrega: t.dealFechaEntrega,
          }}
        />

        {summary && (
          <div className="space-y-1 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-3">
            <p className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ds-text-3">
              <Sparkles className="h-3.5 w-3.5 text-tint-violet-fg" />
              {summary.mode === "full" ? "Resumen del hilo" : "Desde tu última lectura"}
              {summary.cached ? " · cacheado" : ""}
            </p>
            <p className="whitespace-pre-wrap text-[13px] leading-5 text-ds-text-2">{summary.summary}</p>
          </div>
        )}
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
        onAiCommand={onAiCommand}
        onAssociate={onAssociate}
        onRefresh={onRefresh}
        onClose={() => {
          setPanel(null);
        }}
      />
    </div>
  );
}
