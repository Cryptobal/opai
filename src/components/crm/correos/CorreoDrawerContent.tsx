"use client";

import { useEffect, useState } from "react";
import {
  Code2,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Printer,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { canEdit } from "@/lib/permissions";
import { useEffectivePermissions } from "@/hooks/useEffectivePermissions";
import { CorreoMessages } from "./CorreoMessages";
import { CorreoReplyBox } from "./CorreoReplyBox";
import { CorreoThreadActions } from "./CorreoThreadActions";
import { CorreoSystemLabels } from "./CorreoSystemLabels";
import { CorreoWorkPanel } from "./CorreoWorkPanel";
import { CorreoWorkProvider } from "./CorreoWorkContext";
import { CorreoContextChain } from "./CorreoContextChain";
import { resolveWorkTab, type WorkTab } from "./work-panel-tabs";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";
import type { CorreoAiCommandId } from "@/modules/crm/email/correo-ai-commands";
import type { CorreoShortcuts } from "./useCorreosViewPreferences";
import { nextIntentNonce, type ComposeIntent } from "./correo-reader-intent";
import type { CorreoMessageDTO } from "@/modules/crm/email/correos.types";

type Props = {
  detail: CorreoDetail;
  mailboxEmail?: string | null;
  canModify?: boolean;
  onOpenAiLead: () => void;
  onAiCommand?: (commandId: CorreoAiCommandId) => void;
  onAssociate: (p: {
    accountId: string | null;
    dealId: string | null;
    sharedWithAccount?: boolean;
  }) => void | Promise<void>;
  onRefresh: () => void;
  onClose?: () => void;
  onRemove?: (threadId: string) => void;
  onRemoveDone?: () => void;
  onUndoDone?: () => void;
  onReply?: () => void;
  /** Abre el compositor de respuesta (Continuar → Redactar). */
  onRequestReply?: () => void;
  onSnooze?: () => void;
  alwaysShowImages?: boolean;
  onAlwaysShowImages?: () => void;
  shortcuts?: CorreoShortcuts;
  /** Abrir panel en una pestaña (menú contextual / deep-link). */
  workTabIntent?: { tab: WorkTab; nonce: number } | null;
  composeIntent?: ComposeIntent | null;
  /** Cursor de lectura capturado al abrir (antes del markRead). */
  readCursorAt?: string | null;
  /** Token del drawer: refresca el contexto del panel de trabajo. */
  dataRevision?: number;
  onOpenAiStyle?: () => void;
  onOpenSignature?: () => void;
};

function copilotoAttentionReasons(detail: CorreoDetail): string[] {
  const t = detail.thread;
  const reasons: string[] = [];
  if (t.accountId == null) reasons.push("sin cuenta asociada");
  if (detail.attachments.some((a) => !a.savedFileId)) reasons.push("adjuntos sin guardar");
  if (t.aiUrgency === "alta" && !t.dealId) reasons.push("urgencia alta sin negocio");
  return reasons;
}

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
  onRequestReply,
  onSnooze,
  alwaysShowImages,
  onAlwaysShowImages,
  shortcuts,
  workTabIntent = null,
  composeIntent = null,
  readCursorAt = null,
  dataRevision = 0,
  onOpenAiStyle,
  onOpenSignature,
}: Props) {
  const t = detail.thread;
  const perms = useEffectivePermissions();
  const canEditCorreos = canEdit(perms, "crm", "correos");
  const [panel, setPanel] = useState<{ tab: WorkTab } | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [continueDraftIntent, setContinueDraftIntent] = useState<{
    message: CorreoMessageDTO;
    nonce: number;
  } | null>(null);
  const gmailUrl = t.providerThreadId
    ? `https://mail.google.com/mail/u/0/#all/${t.providerThreadId}`
    : null;
  const reasons = copilotoAttentionReasons(detail);
  const attentionLabel =
    reasons.length > 0
      ? `Copiloto — ${reasons.length} ${reasons.length === 1 ? "pendiente" : "pendientes"}: ${reasons.join(", ")}`
      : "Copiloto";

  useEffect(() => {
    if (!workTabIntent) return;
    setPanel({ tab: resolveWorkTab(workTabIntent.tab) });
    // nonce garantiza re-apertura aunque sea la misma pestaña.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workTabIntent?.nonce]);

  useEffect(() => {
    setOverflowOpen(false);
  }, [t.id]);

  useEffect(() => {
    if (!overflowOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOverflowOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [overflowOpen]);

  const openPanel = (tab: WorkTab) => setPanel({ tab: resolveWorkTab(tab) });

  async function copyThreadLink() {
    setOverflowOpen(false);
    const url = `${window.location.origin}/crm/correos?thread=${encodeURIComponent(t.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace del hilo copiado");
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  }

  function printThread() {
    setOverflowOpen(false);
    window.print();
  }

  function viewOriginal() {
    setOverflowOpen(false);
    document
      .querySelector("[data-correo-message]")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast.message("Desplazado al mensaje original");
  }

  return (
    <CorreoWorkProvider
      key={t.id}
      threadId={t.id}
      accountId={t.accountId}
      revision={dataRevision}
    >
      <div className="flex min-h-0 flex-col gap-4">
        <div className="shrink-0 space-y-2 border-b border-ds-border-subtle bg-background pb-3 lg:bg-ds-surface-2">
          {canModify && (
            <div className="hidden flex-wrap items-center gap-2 lg:flex">
              <CorreoThreadActions
                threadId={t.id}
                isUnread={t.isUnread}
                archived={Boolean(t.archivedAt)}
                trashed={Boolean(t.trashedAt)}
                snoozedUntil={t.snoozedUntil}
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

          <CorreoSystemLabels
            threadId={t.id}
            trashedAt={t.trashedAt}
            snoozedUntil={t.snoozedUntil}
            canModify={Boolean(canModify)}
            onDone={onRefresh}
            onRemove={onRemove}
            onRemoveDone={onRemoveDone}
            onUndoDone={onUndoDone}
            onClose={onClose}
          />

          {/* Cadena de contexto + Copiloto + overflow */}
          <div className="flex min-w-0 items-start gap-1.5">
            <div className="min-w-0 flex-1">
              <CorreoContextChain
                detail={detail}
                canEdit={canEditCorreos}
                onAssociate={onAssociate}
                onSearchAccount={() => openPanel("contexto")}
              />
            </div>

            <button
              type="button"
              onClick={() => openPanel("contexto")}
              title={attentionLabel}
              aria-label={attentionLabel}
              className="relative inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-tint-violet/30 bg-tint-violet/10 px-2.5 text-[12px] font-medium text-tint-violet-fg ds-tap sm:min-h-8"
            >
              <Sparkles className="h-3.5 w-3.5" /> ✦ Copiloto
              {reasons.length > 0 && (
                <>
                  <span
                    className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-status-warn"
                    aria-hidden
                  />
                  <span className="sr-only">{attentionLabel}</span>
                </>
              )}
            </button>

            <div className="relative shrink-0">
              <button
                type="button"
                aria-label="Más acciones"
                aria-expanded={overflowOpen}
                onClick={() => setOverflowOpen((o) => !o)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-ds-border-default bg-ds-surface-1 text-ds-text-2 ds-tap sm:h-8 sm:w-8"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {overflowOpen && (
                <>
                  {/* Scrim transparente: captura el tap fuera del menú y evita que el
                      click sintetizado (touch → mousedown → click) llegue al footer
                      sticky (p. ej. Eliminar → Papelera). */}
                  <div
                    aria-hidden
                    className="fixed inset-0 z-[55]"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setOverflowOpen(false);
                    }}
                  />
                  <div
                    role="menu"
                    className="absolute right-0 z-[56] mt-1 w-52 overflow-hidden rounded-xl border border-ds-border-default bg-ds-surface-1 py-1 shadow-ds-lg"
                  >
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
                    <button
                      type="button"
                      role="menuitem"
                      onClick={printThread}
                      className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2 sm:min-h-9"
                    >
                      <Printer className="h-4 w-4 text-ds-text-3" /> Imprimir
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={viewOriginal}
                      className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2 sm:min-h-9"
                    >
                      <Code2 className="h-4 w-4 text-ds-text-3" /> Ver original
                    </button>
                    <div className="my-1 border-t border-ds-border-subtle" role="separator" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void copyThreadLink()}
                      className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2 sm:min-h-9"
                    >
                      <Copy className="h-4 w-4 text-ds-text-3" /> Copiar enlace del hilo
                    </button>
                  </div>
                </>
              )}
            </div>
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
            inSpam={Boolean(t.spamAt)}
            canModify={canModify}
            attachments={detail.attachments}
            dealId={t.dealId}
            dealTitle={t.dealTitle}
            accountId={t.accountId}
            accountName={t.accountName}
            mailboxEmail={mailboxEmail}
            degraded={detail.degraded}
            onAttachmentsSaved={onRefresh}
            onRequestAssociate={() => openPanel("contexto")}
            onDraftDiscarded={onRefresh}
            onContinueDraft={(m) =>
              setContinueDraftIntent({ message: m, nonce: nextIntentNonce() })
            }
          />
          <CorreoReplyBox
            key={`reply-${t.id}`}
            detail={detail}
            onSent={onRefresh}
            shortcuts={shortcuts}
            composeIntent={composeIntent}
            continueDraftIntent={continueDraftIntent}
            onOpenAiStyle={onOpenAiStyle}
            onOpenSignature={onOpenSignature}
          />
        </div>

        <CorreoWorkPanel
          open={panel !== null}
          initialTab={panel?.tab ?? "contexto"}
          detail={detail}
          readCursorAt={readCursorAt}
          workTabIntent={workTabIntent}
          onOpenAiLead={onOpenAiLead}
          onAiCommand={onAiCommand}
          onAssociate={onAssociate}
          onRefresh={onRefresh}
          onRequestReply={onRequestReply ?? onReply}
          onClose={() => {
            setPanel(null);
          }}
        />
      </div>
    </CorreoWorkProvider>
  );
}
