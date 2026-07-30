"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, ExternalLink } from "lucide-react";
import { Spinner } from "@/components/opai-ds";
import { CorreoMessages } from "./correos/CorreoMessages";
import { CorreoAttachmentViewer, type ViewerFile } from "./correos/CorreoAttachmentViewer";
import { CorreoReaderShell } from "./correos/CorreoReaderShell";
import { CorreoReplyBox } from "./correos/CorreoReplyBox";
import { nextIntentNonce } from "./correos/correo-reader-intent";
import { useCorreoFocusScope } from "./correos/useCorreoFocusScope";
import { parseSender } from "./correos/correo-sender";
import type { CorreoAttachmentDTO, CorreoMessageDTO } from "@/modules/crm/email/correos.types";
import type { ConversationEntityType } from "@/modules/crm/email/entity-conversations";
import { EntityMessageAttachments } from "./entity-conversations/EntityMessageAttachments";
import { ensureEntityLink } from "./entity-conversations/ensure-entity-link";
import { useEntityReaderWidth } from "./entity-conversations/useEntityReaderWidth";
import { useEntityThreadDetail } from "./entity-conversations/useEntityThreadDetail";

/**
 * Lector de conversación en ficha: misma ventana que el módulo Correo
 * (shell, cabecera, mensajes, adjuntos, respuesta en línea) con ancho
 * redimensionable persistido.
 */
export function EntityThreadReader({
  threadId,
  entityType,
  entityId,
  preview,
  accountId = null,
  dealId = null,
  contactId = null,
  onChanged,
  onClose,
}: {
  threadId: string | null;
  entityType: ConversationEntityType;
  entityId: string;
  preview?: { subject: string; fromEmail: string | null };
  accountId?: string | null;
  dealId?: string | null;
  contactId?: string | null;
  onChanged?: () => void;
  onClose: () => void;
}) {
  useCorreoFocusScope(Boolean(threadId));
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const [continueDraftIntent, setContinueDraftIntent] = useState<{
    message: CorreoMessageDTO;
    nonce: number;
  } | null>(null);
  const { width, reset, onResizePointerDown, onResizeKeyDown } = useEntityReaderWidth();
  const { detail, state, reload } = useEntityThreadDetail(threadId, entityType, entityId);

  if (!threadId) return null;

  const rawFrom =
    detail?.messages.find((m) => m.direction !== "out")?.fromEmail ??
    detail?.messages[0]?.fromEmail ??
    preview?.fromEmail ??
    "";
  const sender = parseSender(rawFrom);
  const headerFrom = sender.name || sender.email || rawFrom || "—";
  const headerSubject = detail?.thread.subject || preview?.subject || "Conversación";

  const openAttachment = (a: CorreoAttachmentDTO) => {
    if (!a.savedFileId) return;
    setViewer({
      url: `/api/crm/files/${a.savedFileId}/download`,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
    });
  };

  const replyDetail =
    detail &&
    ({
      ...detail,
      thread: {
        ...detail.thread,
        accountId: accountId ?? detail.associations?.accountId ?? detail.thread.accountId,
        dealId: dealId ?? detail.associations?.dealId ?? detail.thread.dealId,
        contactId: contactId ?? detail.associations?.contactId ?? detail.thread.contactId,
      },
    });

  return (
    <CorreoReaderShell
      open
      onClose={onClose}
      headerFrom={headerFrom}
      headerSubject={headerSubject}
      desktopWidth={width}
      onResizePointerDown={onResizePointerDown}
      onResizeKeyDown={onResizeKeyDown}
      onResizeReset={reset}
      desktopMode="overlay"
      resizable
    >
      {state === "loading" ? (
        <Spinner className="mx-auto" />
      ) : state === "forbidden" ? (
        <p className="text-ds-body text-status-warn-fg">No tenés acceso a esta conversación.</p>
      ) : state === "error" ? (
        <div className="space-y-2 text-ds-body">
          <p className="text-status-danger-fg">No se pudo cargar la conversación.</p>
          <button
            type="button"
            className="h-10 rounded-lg border border-ds-border-default px-3 text-ds-text-2 ds-tap"
            onClick={reload}
          >
            Reintentar
          </button>
        </div>
      ) : detail && !detail.synced ? (
        <div className="flex items-center gap-2 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-4 text-ds-body text-ds-text-4">
          <Clock className="h-4 w-4 shrink-0" />
          Conversación no sincronizada todavía.
        </div>
      ) : detail && replyDetail ? (
        <>
          <CorreoMessages
            messages={detail.messages}
            attachments={detail.attachments}
            renderMessageAttachments={(_m, items) => (
              <EntityMessageAttachments items={items} onOpen={openAttachment} />
            )}
            onDraftDiscarded={() => {
              void reload();
              onChanged?.();
            }}
            onContinueDraft={(m) =>
              setContinueDraftIntent({ message: m, nonce: nextIntentNonce() })
            }
          />
          {detail.canReply ? (
            <div className="space-y-2">
              {/* Action bar se porta al dock fijo del shell; aquí queda el
                  composer (cuando abre) + atajo a Correo. */}
              <CorreoReplyBox
                detail={replyDetail}
                continueDraftIntent={continueDraftIntent}
                onSent={async () => {
                  await ensureEntityLink({ threadId, entityType, entityId });
                  void reload();
                  onChanged?.();
                }}
              />
              <Link
                href={`/crm/correos?thread=${threadId}`}
                className="inline-flex h-10 items-center gap-1.5 px-1 text-[12px] text-ds-text-3 ds-tap hover:text-ds-text-2"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir en Correo
              </Link>
            </div>
          ) : detail.ownerEmail ? (
            <p className="rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-3 text-ds-body text-ds-text-3">
              Este hilo pertenece a la casilla de {detail.ownerEmail}.
            </p>
          ) : null}
        </>
      ) : null}
      <CorreoAttachmentViewer file={viewer} onClose={() => setViewer(null)} />
    </CorreoReaderShell>
  );
}
