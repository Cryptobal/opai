"use client";

import { useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/opai-ds";
import { CorreoActionBar } from "./CorreoActionBar";
import { CorreoComposerBox, type ComposerMode, type ReplyAll } from "./CorreoComposerBox";
import type { ForwardAttachmentRefClient } from "./EmailComposer";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";

type Meta = { to: string[]; replyAll: ReplyAll | null; radarItemId: string | null; preDraft: string | null };

/** HTML citado del último mensaje del hilo para reenviar (C13). */
function buildForwardQuote(detail: CorreoDetail): string {
  const last = detail.messages[detail.messages.length - 1];
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
      ? last.textBody.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")
      : "");
  return `${meta}<br><br>${body}`;
}

/**
 * Orquesta la respuesta del lector (Bloque 2): barra de acciones Gmail (cerrado)
 * ⇄ composer con modos (abierto), en exclusividad total. Atajos R/A/F/I cuando
 * no hay foco en inputs. Absorbe la lógica IA del antiguo SuggestedReplyPanel.
 */
export function CorreoReplyBox({ detail, onSent }: { detail: CorreoDetail; onSent: () => void }) {
  const threadId = detail.thread.id;
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<{ mode: ComposerMode; ai: boolean } | null>(null);

  useEffect(() => {
    setOpen(null);
    setLoading(true);
    fetch(`/api/crm/correos/${threadId}/suggest-reply`)
      .then((r) => r.json())
      .then((d) =>
        setMeta({
          to: d.to ? [String(d.to).toLowerCase()] : [],
          replyAll: d.replyAll ?? null,
          radarItemId: d.radarItemId ?? null,
          preDraft: d.draft ? String(d.draft) : null,
        }),
      )
      .catch(() => setMeta({ to: [], replyAll: null, radarItemId: null, preDraft: null }))
      .finally(() => setLoading(false));
  }, [threadId]);

  const canReply = (meta?.to.length ?? 0) > 0 || Boolean(meta?.replyAll);
  const replyAllAvailable = useMemo(() => {
    const ra = meta?.replyAll;
    const to = meta?.to ?? [];
    return Boolean(ra && (ra.cc.length > 0 || ra.to.some((e) => !to.includes(e)) || ra.to.length !== to.length));
  }, [meta]);

  const forwardAttachments: ForwardAttachmentRefClient[] = detail.attachments.map((a) => ({
    providerMessageId: a.messageId,
    attachmentId: a.attachmentId,
    fileName: a.filename,
    size: a.size,
  }));

  // Atajos de teclado (solo con la barra visible y sin foco en inputs).
  useEffect(() => {
    if (open || loading) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement | null)?.isContentEditable) return;
      const k = e.key.toLowerCase();
      if (k === "r" && canReply) setOpen({ mode: "reply", ai: false });
      else if (k === "a" && canReply && replyAllAvailable) setOpen({ mode: "all", ai: false });
      else if (k === "f") setOpen({ mode: "forward", ai: false });
      else if (k === "i" && canReply) setOpen({ mode: "reply", ai: true });
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, canReply, replyAllAvailable]);

  if (loading) return <Spinner className="mx-auto" />;

  if (!open) {
    return (
      <CorreoActionBar
        canReply={canReply}
        replyAllAvailable={replyAllAvailable}
        onReply={() => setOpen({ mode: "reply", ai: false })}
        onReplyAll={() => setOpen({ mode: "all", ai: false })}
        onForward={() => setOpen({ mode: "forward", ai: false })}
        onReplyAI={() => setOpen({ mode: "reply", ai: true })}
      />
    );
  }

  return (
    <CorreoComposerBox
      threadId={threadId}
      subject={detail.thread.subject}
      accountId={detail.thread.accountId}
      dealId={detail.thread.dealId}
      to={meta?.to ?? []}
      replyAll={meta?.replyAll ?? null}
      radarItemId={meta?.radarItemId ?? null}
      preDraft={meta?.preDraft ?? null}
      forwardQuotedHtml={buildForwardQuote(detail)}
      forwardAttachments={forwardAttachments}
      mode={open.mode}
      ai={open.ai}
      onModeChange={(mode) => setOpen((o) => (o ? { ...o, mode } : o))}
      onToggleAi={() => setOpen((o) => (o ? { ...o, ai: !o.ai } : o))}
      onClose={() => setOpen(null)}
      onSent={onSent}
    />
  );
}
