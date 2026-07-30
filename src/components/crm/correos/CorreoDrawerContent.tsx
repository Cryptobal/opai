"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { canEdit } from "@/lib/permissions";
import { useEffectivePermissions } from "@/hooks/useEffectivePermissions";
import { CorreoMessages } from "./CorreoMessages";
import { CorreoReplyBox } from "./CorreoReplyBox";
import { CorreoThreadActions } from "./CorreoThreadActions";
import { CorreoSystemLabels } from "./CorreoSystemLabels";
import { CorreoReaderTitleBlock } from "./CorreoReaderTitleBlock";
import { CorreoReaderOverflowMenu } from "./CorreoReaderOverflowMenu";
import { CorreoCopilotBanner } from "./CorreoCopilotBanner";
import { CorreoWorkPanel } from "./CorreoWorkPanel";
import { CorreoWorkProvider } from "./CorreoWorkContext";
import { CorreoContextChain } from "./CorreoContextChain";
import { copilotoAttentionReasons } from "./correo-copiloto-reasons";
import { useCorreoSuggestedAccounts } from "./useCorreoSuggestedAccounts";
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
  /** Eleva la acción primaria resuelta (isla móvil). */
  onPrimaryActionChange?: (
    action: import("./correo-primary-action").CorreoPrimaryAction | null,
  ) => void;
  /** Notifica apertura/cierre del composer (la isla se oculta al abrir). */
  onComposerOpenChange?: (open: boolean) => void;
};

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
  onPrimaryActionChange,
  onComposerOpenChange,
}: Props) {
  const t = detail.thread;
  const perms = useEffectivePermissions();
  const canEditCorreos = canEdit(perms, "crm", "correos");
  const [panel, setPanel] = useState<{ tab: WorkTab } | null>(null);
  // Descartar el banner de Copiloto es efímero por sesión de hilo.
  const [copilotDismissed, setCopilotDismissed] = useState(false);
  const [continueDraftIntent, setContinueDraftIntent] = useState<{
    message: CorreoMessageDTO;
    nonce: number;
  } | null>(null);
  const reasons = copilotoAttentionReasons(detail);
  const attentionLabel =
    reasons.length > 0
      ? `Copiloto — ${reasons.length} ${reasons.length === 1 ? "pendiente" : "pendientes"}: ${reasons.join(", ")}`
      : "Copiloto";
  // Cuentas sugeridas (móvil): mismo caché que la cadena de contexto → 1 fetch.
  const suggestions = useCorreoSuggestedAccounts(t.id, t.accountId == null);

  useEffect(() => {
    if (!workTabIntent) return;
    setPanel({ tab: resolveWorkTab(workTabIntent.tab) });
    // nonce garantiza re-apertura aunque sea la misma pestaña.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workTabIntent?.nonce]);

  useEffect(() => {
    setCopilotDismissed(false);
  }, [t.id]);

  const openPanel = (tab: WorkTab) => setPanel({ tab: resolveWorkTab(tab) });

  return (
    <CorreoWorkProvider
      key={t.id}
      threadId={t.id}
      accountId={t.accountId}
      revision={dataRevision}
    >
      <div className="flex min-h-0 flex-col gap-4">
        {/* Cabecera de contexto: solo desktop (lg+). En móvil, el asunto y el
            remitente viven en el bloque de título; las etiquetas de sistema se
            reubican dentro de él. */}
        <div className="hidden shrink-0 space-y-2 border-b border-ds-border-subtle bg-background pb-3 lg:block lg:bg-ds-surface-2">
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

            <CorreoReaderOverflowMenu
              threadId={t.id}
              providerThreadId={t.providerThreadId}
              onOpenSignature={onOpenSignature}
              onOpenAiStyle={onOpenAiStyle}
            />
          </div>
        </div>

        {/* Bloque de título móvil (<lg): asunto grande + remitente + metadata. */}
        <CorreoReaderTitleBlock
          detail={detail}
          canModify={Boolean(canModify)}
          onDone={onRefresh}
          onRemove={onRemove}
          onRemoveDone={onRemoveDone}
          onUndoDone={onUndoDone}
          onClose={onClose}
        />

        {/* Copiloto / contexto (móvil): un solo banner con pendientes y chips;
            sin pendientes, breadcrumb compacto. En desktop lo cubre la fila
            de contexto de arriba. */}
        <div className="lg:hidden">
          {reasons.length > 0 && !copilotDismissed ? (
            <CorreoCopilotBanner
              detail={detail}
              canEdit={canEditCorreos}
              suggestions={suggestions}
              onAssociate={(accountId) => void onAssociate({ accountId, dealId: null })}
              onOpenPanel={() => openPanel("contexto")}
              onSaveAttachments={() => openPanel("contexto")}
              onDismiss={() => setCopilotDismissed(true)}
            />
          ) : t.accountId ? (
            <CorreoContextChain
              detail={detail}
              canEdit={canEditCorreos}
              onAssociate={onAssociate}
              onSearchAccount={() => openPanel("contexto")}
              variant="breadcrumb"
            />
          ) : null}
        </div>

        {/* Degradado: en móvil es un motivo del banner de Copiloto. */}
        {detail.degraded && (
          <div className="hidden shrink-0 rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2.5 text-ds-body text-status-warn-fg lg:block">
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
            onPrimaryActionChange={onPrimaryActionChange}
            onOpenChange={onComposerOpenChange}
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
