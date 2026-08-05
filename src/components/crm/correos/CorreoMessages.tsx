"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CorreoMessageDTO } from "@/modules/crm/email/correos.types";
import { CorreoMessageOpen } from "./CorreoMessageOpen";
import { CorreoMessageRow } from "./CorreoMessageRow";
import { CorreoThreadFoldSeparator } from "./CorreoThreadFoldSeparator";
import { attachmentsForMessage } from "./correo-attachments-scope";
import { foldThread } from "./correo-thread-fold";
import {
  resolveThreadOpenScrollId,
  scheduleThreadOpenScroll,
} from "./correo-thread-scroll";
import type { MessageImagePrefs, MessageSavePrefs } from "./correo-message-types";

type Props = {
  messages: CorreoMessageDTO[];
  /** Deep-link del copiloto: mensaje a expandir/scrollear al abrir. */
  initialMessageId?: string | null;
  /** Ids sin leer (derivados del cursor de lectura): visibles y expandidos. */
  unreadMessageIds?: string[];
  /** Fuerza la cadena completa expandida ("Expandir todo" de la cabecera). */
  expandAllNonce?: number;
} & MessageImagePrefs &
  MessageSavePrefs;

/**
 * Cadena del hilo con plegado estilo Gmail: primero + penúltimo + último
 * visibles (más no leídos, borradores y el deep-link `?mensaje=`), el resto
 * detrás de una píldora contadora. El último mensaje abre expandido; los demás
 * visibles, colapsados en una línea. Al abrir, el scroller se ancla en el
 * penúltimo (peek de 1 línea) con el último debajo — como Gmail. Solo los
 * expandidos montan `EmailHtmlBody`.
 */
export function CorreoMessages({
  messages,
  initialMessageId = null,
  unreadMessageIds = [],
  expandAllNonce = 0,
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
}: Props) {
  const deepLinkedId =
    initialMessageId && messages.some((m) => m.id === initialMessageId)
      ? initialMessageId
      : null;

  // unreadMessageIds llega como array nuevo en cada render del padre; la
  // identidad estable la da su contenido.
  const unreadKey = unreadMessageIds.join(",");
  const fold = useMemo(
    () =>
      foldThread(messages, {
        forceExpandId: deepLinkedId,
        unreadIds: unreadKey ? unreadKey.split(",") : [],
      }),
    [messages, deepLinkedId, unreadKey],
  );

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(fold.expanded.map((i) => messages[i]?.id).filter(Boolean) as string[]),
  );
  /** Historial desplegado por el usuario (píldora contadora). */
  const [ungrouped, setUngrouped] = useState(false);

  // Cambio de hilo (o de cadena): re-sembrar expandidos y volver a agrupar.
  const threadKey = threadId ?? messages[0]?.id ?? "";
  const seededRef = useRef<string>("");
  useEffect(() => {
    const key = `${threadKey}:${messages.length}:${deepLinkedId ?? ""}`;
    if (seededRef.current === key) return;
    seededRef.current = key;
    setExpanded(new Set(fold.expanded.map((i) => messages[i]?.id).filter(Boolean) as string[]));
    setUngrouped(false);
  }, [threadKey, messages, deepLinkedId, fold.expanded]);

  // "Expandir todo": despliega el grupo y abre cada mensaje.
  useEffect(() => {
    if (expandAllNonce <= 0) return;
    setUngrouped(true);
    setExpanded(new Set(messages.map((m) => m.id)));
  }, [expandAllNonce, messages]);

  // Scroll de apertura estilo Gmail: penúltimo (peek) + último expandido.
  // Deep-link a un mensaje intermedio prioriza ese id. Una vez por hilo/cadena.
  const openScrolledKeyRef = useRef("");
  useEffect(() => {
    const ids = messages.map((m) => m.id);
    const targetId = resolveThreadOpenScrollId(ids, deepLinkedId);
    if (!targetId) return;
    const key = `${threadKey}:${ids.length}:${deepLinkedId ?? ""}:${ids[ids.length - 1] ?? ""}`;
    if (openScrolledKeyRef.current === key) return;
    return scheduleThreadOpenScroll(targetId, () => {
      openScrolledKeyRef.current = key;
    });
  }, [threadKey, messages, deepLinkedId]);

  if (messages.length === 0) {
    return <p className="text-[13px] text-ds-text-4">Sin mensajes.</p>;
  }

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const grouped = fold.hiddenCount > 0 && !ungrouped;
  const rendered = grouped ? fold.visible : messages.map((_, i) => i);
  const unread = new Set(unreadMessageIds);

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-ds-border-subtle bg-ds-surface-1">
      {rendered.map((index, position) => {
        const m = messages[index];
        if (!m) return null;
        const isOpen = expanded.has(m.id);
        const isUnread = unread.has(m.id);
        return (
          <div
            key={m.id}
            className={`min-w-0 ${position > 0 ? "border-t border-ds-border-subtle" : ""} ${
              isUnread ? "border-l-[3px] border-l-primary" : ""
            } ${m.isDraft ? "bg-status-warn-soft/40" : ""}`}
          >
            {isOpen ? (
              <CorreoMessageOpen
                m={m}
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
            ) : (
              <CorreoMessageRow
                m={m}
                unread={isUnread}
                attachmentCount={attachmentsForMessage(attachments, m).length}
                onOpen={() => toggle(m.id)}
              />
            )}
            {fold.separatorAfterIndex === index && fold.hiddenCount > 0 ? (
              <div className="border-t border-ds-border-subtle">
                <CorreoThreadFoldSeparator
                  hiddenCount={fold.hiddenCount}
                  ungrouped={ungrouped}
                  onToggle={() => setUngrouped((v) => !v)}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
