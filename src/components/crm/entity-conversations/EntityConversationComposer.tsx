"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { Tag } from "@/components/opai-ds";
import { EmailComposer } from "@/components/crm/correos/EmailComposer";
import { plainTextToTiptapDoc } from "@/components/crm/correos/email-inline-images";
import type { ComposeAction } from "./EntityConversationActions";
import type { ConversationEntityType } from "@/modules/crm/email/entity-conversations";
import type { CorreoMessageDTO } from "@/modules/crm/email/correos.types";
import {
  computeReplyAllRecipients,
  preferredReplyAddress,
} from "@/modules/crm/email/reply-recipients";

type ContextChip = { id: string; label: string };

type Props = {
  open: boolean;
  action: ComposeAction | null;
  threadId: string;
  subject: string;
  messages: CorreoMessageDTO[];
  entityType: ConversationEntityType;
  entityId: string;
  accountId: string | null;
  dealId: string | null;
  contactId: string | null;
  mailboxEmail: string | null;
  onClose: () => void;
  onSent: () => void;
};

function buildQuotedHtml(messages: CorreoMessageDTO[]): string {
  const last = messages[messages.length - 1];
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

async function ensureEntityLink(params: {
  threadId: string;
  entityType: ConversationEntityType;
  entityId: string;
}) {
  if (params.entityType !== "installation" && params.entityType !== "quote") return;
  await fetch(`/api/crm/correos/${params.threadId}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entityType: params.entityType,
      entityId: params.entityId,
      linkedVia: "manual",
    }),
  }).catch(() => undefined);
}

/**
 * Composer de respuesta desde la ficha. Reutiliza EmailComposer sin fork.
 */
export function EntityConversationComposer({
  open,
  action,
  threadId,
  subject,
  messages,
  entityType,
  entityId,
  accountId,
  dealId,
  contactId,
  mailboxEmail,
  onClose,
  onSent,
}: Props) {
  const [aiDraft, setAiDraft] = useState<object | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [chips, setChips] = useState<ContextChip[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const lastInbound = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].direction === "in") return messages[i];
    }
    return messages[messages.length - 1] ?? null;
  }, [messages]);

  const recipients = useMemo(() => {
    if (!lastInbound) return { to: [] as string[], cc: [] as string[], replyAll: null as null | { to: string[]; cc: string[] } };
    const to = [
      preferredReplyAddress({
        fromEmail: lastInbound.fromEmail,
        replyToEmail: lastInbound.replyToEmail,
      }),
    ].filter(Boolean);
    const replyAll = mailboxEmail
      ? computeReplyAllRecipients({
          fromEmail: lastInbound.fromEmail,
          replyToEmail: lastInbound.replyToEmail,
          toEmails: lastInbound.toEmails,
          ccEmails: lastInbound.ccEmails,
          ownEmail: mailboxEmail,
        })
      : null;
    return { to, cc: [] as string[], replyAll };
  }, [lastInbound, mailboxEmail]);

  useEffect(() => {
    if (!open || action !== "ai") {
      setAiDraft(null);
      setChips([]);
      return;
    }
    setAiLoading(true);
    const initialChips: ContextChip[] = [];
    if (accountId) initialChips.push({ id: "account", label: "Cuenta" });
    if (dealId) initialChips.push({ id: "deal", label: "Negocio" });
    if (contactId) initialChips.push({ id: "contact", label: "Contacto" });
    initialChips.push({ id: "thread", label: "Hilo" });
    setChips(initialChips);

    fetch(`/api/crm/correos/${threadId}/suggest-reply`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d.draft) setAiDraft(plainTextToTiptapDoc(String(d.draft)));
      })
      .catch(() => undefined)
      .finally(() => setAiLoading(false));
  }, [open, action, threadId, accountId, dealId, contactId]);

  // Regenerar borrador al quitar un chip de contexto.
  useEffect(() => {
    if (!open || action !== "ai" || chips.length === 0 || aiLoading) return;
    // Solo regenera si el usuario quitó chips (no en el primer set).
  }, [chips, open, action, aiLoading]);

  function removeChip(id: string) {
    setChips((prev) => {
      const next = prev.filter((c) => c.id !== id);
      // Re-pedir borrador con contexto reducido (best-effort: mismo endpoint).
      if (action === "ai") {
        setAiLoading(true);
        fetch(`/api/crm/correos/${threadId}/suggest-reply`, { method: "POST" })
          .then((r) => r.json())
          .then((d) => {
            if (d.draft) setAiDraft(plainTextToTiptapDoc(String(d.draft)));
          })
          .catch(() => undefined)
          .finally(() => setAiLoading(false));
      }
      return next;
    });
  }

  if (!open || !action || !mounted) return null;

  const isForward = action === "forward";
  const useReplyAll = action === "replyAll" && recipients.replyAll;
  const initialTo = useReplyAll ? recipients.replyAll!.to : recipients.to;
  const initialCc = useReplyAll ? recipients.replyAll!.cc : [];

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal
        aria-label="Responder correo"
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-ds-border-default bg-background shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-center gap-2 border-b border-ds-border-subtle px-3 py-2">
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ds-text-1">
            {action === "ai"
              ? "✦ Responder con IA"
              : action === "forward"
                ? "Reenviar"
                : action === "replyAll"
                  ? "Responder a todos"
                  : "Responder"}
          </p>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ds-text-3 ds-tap"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        {action === "ai" && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-ds-border-subtle px-3 py-2">
            <span className="text-[12px] text-ds-text-3">Contexto IA:</span>
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => removeChip(c.id)}
                className="inline-flex items-center gap-1"
                title="Quitar del contexto"
              >
                <Tag variant="brand" size="sm">
                  {c.label} ×
                </Tag>
              </button>
            ))}
            {aiLoading && <span className="text-[12px] text-ds-text-4">Generando…</span>}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <EmailComposer
            key={`${threadId}:${action}:${chips.map((c) => c.id).join(",")}`}
            mode={isForward ? "forward" : "reply"}
            layout="sheet"
            threadId={isForward ? null : threadId}
            initialTo={initialTo}
            initialCc={initialCc}
            initialSubject={subject}
            replyAll={recipients.replyAll}
            initialContent={action === "ai" ? aiDraft : null}
            contentEpoch={action === "ai" && aiDraft ? 1 : 0}
            quotedHtml={isForward ? buildQuotedHtml(messages) : null}
            forwardFromThreadId={isForward ? threadId : null}
            accountId={accountId}
            dealId={dealId}
            contactId={contactId}
            onClose={onClose}
            onSent={async () => {
              await ensureEntityLink({ threadId, entityType, entityId });
              onSent();
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
