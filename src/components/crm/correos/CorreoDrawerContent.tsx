"use client";

import { useMemo, useState } from "react";
import { ChevronsUpDown, Sparkles } from "lucide-react";
import { canEdit } from "@/lib/permissions";
import { useEffectivePermissions } from "@/hooks/useEffectivePermissions";
import { CorreoMessages } from "./CorreoMessages";
import { CorreoReplyBox } from "./CorreoReplyBox";
import { CorreoSystemLabels } from "./CorreoSystemLabels";
import { CorreoReaderTitleBlock } from "./CorreoReaderTitleBlock";
import { CorreoReaderOverflowMenu } from "./CorreoReaderOverflowMenu";
import { CorreoWorkProvider } from "./CorreoWorkContext";
import { CorreoTasksStrip } from "./CorreoTasksStrip";
import { CorreoContextChain } from "./CorreoContextChain";
import { copilotoAttentionReasons } from "./correo-copiloto-reasons";
import { resolveWorkTab, type WorkTab } from "./work-panel-tabs";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";
import type { CorreoShortcuts } from "./useCorreosViewPreferences";
import { runCorreoAction } from "./correo-thread-action-client";
import { unreadMessageIds } from "./correo-thread-fold";
import { nextIntentNonce, type ComposeIntent } from "./correo-reader-intent";
import type { CorreoMessageDTO } from "@/modules/crm/email/correos.types";

type Props = {
  detail: CorreoDetail;
  /** Deep-link `?mensaje=`: mensaje a expandir/scrollear al abrir. */
  initialMessageId?: string | null;
  mailboxEmail?: string | null;
  canModify?: boolean;
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
  /** Abrir Copiloto (estado vive en CorreoDrawer para sobrevivir cambio de hilo). */
  onOpenWorkPanel: (tab: WorkTab) => void;
  composeIntent?: ComposeIntent | null;
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
  /** Cursor de lectura capturado al abrir (antes del markRead): no leídos. */
  readCursorAt?: string | null;
};

export function CorreoDrawerContent({
  detail,
  initialMessageId = null,
  mailboxEmail,
  canModify,
  onAssociate,
  onRefresh,
  onClose,
  onRemove,
  onRemoveDone,
  onUndoDone,
  onRequestReply,
  onSnooze,
  alwaysShowImages,
  onAlwaysShowImages,
  shortcuts,
  onOpenWorkPanel,
  composeIntent = null,
  dataRevision = 0,
  onOpenAiStyle,
  onOpenSignature,
  onPrimaryActionChange,
  onComposerOpenChange,
  readCursorAt = null,
}: Props) {
  const t = detail.thread;
  const perms = useEffectivePermissions();
  const canEditCorreos = canEdit(perms, "crm", "correos");
  const [continueDraftIntent, setContinueDraftIntent] = useState<{
    message: CorreoMessageDTO;
    nonce: number;
  } | null>(null);
  const [expandAllNonce, setExpandAllNonce] = useState(0);
  const unreadIds = useMemo(
    () => unreadMessageIds(detail.messages, readCursorAt ?? t.lastReadAt),
    [detail.messages, readCursorAt, t.lastReadAt],
  );
  const reasons = copilotoAttentionReasons(detail);
  const attentionLabel =
    reasons.length > 0
      ? `Copiloto — ${reasons.length} ${reasons.length === 1 ? "pendiente" : "pendientes"}: ${reasons.join(", ")}`
      : "Copiloto";

  const openPanel = (tab: WorkTab) => onOpenWorkPanel(resolveWorkTab(tab));

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
          {/* Acciones Archivar/Papelera/etc. solo en el listado (hover), estilo Gmail. */}

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

          <CorreoTasksStrip
            canModify={Boolean(canModify)}
            onOpenTrabajo={() => openPanel("trabajo")}
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
              onOpenSnooze={onSnooze}
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
          below={
            <CorreoTasksStrip
              compact
              canModify={Boolean(canModify)}
              onOpenTrabajo={() => openPanel("trabajo")}
            />
          }
        />

        {/* Contexto móvil: breadcrumb siempre (cuenta·deal). Pendientes viven
            en el sheet Copiloto (✨ del header). Desktop: fila de arriba. */}
        <div className="lg:hidden">
          <CorreoContextChain
            detail={detail}
            canEdit={canEditCorreos}
            onAssociate={onAssociate}
            onSearchAccount={() => openPanel("contexto")}
            variant="breadcrumb"
          />
        </div>

        {/* Degradado desktop; en móvil es motivo del sheet Copiloto. */}
        {detail.degraded && (
          <div className="hidden shrink-0 rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2.5 text-[13px] text-status-warn-fg lg:block">
            No se pudieron cargar los adjuntos de este hilo desde Gmail. Reintentá en unos segundos.
          </div>
        )}

        <div className="min-w-0 space-y-2">
          {detail.messages.length > 2 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setExpandAllNonce((n) => n + 1)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium text-ds-text-3 ds-tap hover:text-ds-text-1 sm:min-h-8"
              >
                <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden /> Expandir todo
              </button>
            </div>
          )}
          <CorreoMessages
            messages={detail.messages}
            initialMessageId={initialMessageId}
            unreadMessageIds={unreadIds}
            expandAllNonce={expandAllNonce}
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
            onArchiveAfterSend={
              canModify
                ? () => {
                    const id = t.id;
                    onRemove?.(id);
                    void runCorreoAction(
                      id,
                      "archive",
                      "Enviado y archivado",
                      onRemoveDone ?? onRefresh,
                      "unarchive",
                      onUndoDone,
                    );
                  }
                : undefined
            }
            shortcuts={shortcuts}
            composeIntent={composeIntent}
            continueDraftIntent={continueDraftIntent}
            onOpenAiStyle={onOpenAiStyle}
            onOpenSignature={onOpenSignature}
            onPrimaryActionChange={onPrimaryActionChange}
            onOpenChange={onComposerOpenChange}
          />
        </div>

      </div>
    </CorreoWorkProvider>
  );
}
