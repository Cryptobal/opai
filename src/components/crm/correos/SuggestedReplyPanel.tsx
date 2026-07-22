"use client";

import { useEffect, useState } from "react";
import { Sparkles, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { AttachmentPicker, Spinner } from "@/components/opai-ds";
import { ReplyRecipientsField, isValidEmail } from "./ReplyRecipientsField";
import { RichTextEditor } from "./RichTextEditor";
import { useEmailAttachments } from "./useEmailAttachments";

type ReplyAll = { to: string[]; cc: string[] };
type Props = { threadId: string; subject: string; onSent: () => void };

/** Borrador IA (texto plano) → HTML seguro para el editor. */
function textToHtml(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

/**
 * Sección "Respuesta sugerida por IA" del drawer: textarea editable precargado
 * con el borrador del radar (o generado on-demand) + envío en el mismo hilo,
 * con Para editable, Responder a todos y CC/CCO.
 */
export function SuggestedReplyPanel({ threadId, subject, onSent }: Props) {
  const attachments = useEmailAttachments();
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [replyAll, setReplyAll] = useState<ReplyAll | null>(null);
  const [radarItemId, setRadarItemId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [instructions, setInstructions] = useState("");
  // Asunto editable (como Gmail), precargado con Re:.
  const [replySubject, setReplySubject] = useState(() =>
    subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"gen" | "send" | null>(null);

  useEffect(() => {
    fetch(`/api/crm/correos/${threadId}/suggest-reply`)
      .then((r) => r.json())
      .then((d) => {
        setTo(d.to ? [String(d.to).toLowerCase()] : []);
        setReplyAll(d.replyAll ?? null);
        setRadarItemId(d.radarItemId ?? null);
        if (d.draft) setDraft(textToHtml(d.draft));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [threadId]);

  async function suggest() {
    setBusy("gen");
    try {
      const d = await fetch(`/api/crm/correos/${threadId}/suggest-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions: instructions.trim() || undefined }),
      }).then((r) => r.json());
      if (d.draft) setDraft(textToHtml(d.draft));
    } finally {
      setBusy(null);
    }
  }

  const allValid = [...to, ...cc, ...bcc].every(isValidEmail);
  const draftText = draft.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  const canSend =
    to.length > 0 &&
    allValid &&
    draftText.length > 0 &&
    !attachments.uploading &&
    !attachments.hasErrors;
  const replyAllVisible =
    replyAll &&
    (replyAll.cc.length > 0 || replyAll.to.some((e) => !to.includes(e)) || replyAll.to.length !== to.length);

  function applyReplyAll() {
    if (!replyAll) return;
    setTo(replyAll.to);
    setCc(replyAll.cc);
    if (replyAll.cc.length > 0) setShowCcBcc(true);
  }

  async function send() {
    if (!canSend) return;
    setBusy("send");
    try {
      const res = await fetch("/api/crm/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          to,
          cc,
          bcc,
          subject: replySubject.trim() || subject,
          html: draft,
          attachments: attachments.readyAttachments,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        warning?: string;
      };
      // Antes esto fallaba en silencio: sin toast de error ni de éxito, "no
      // pasaba nada" al tocar Enviar aunque el server rechazara el correo.
      if (!res.ok || data.success === false) {
        toast.error(data.error || "No se pudo enviar la respuesta");
        return;
      }
      if (data.warning) toast.message(data.warning);
      else toast.success("Respuesta enviada por Gmail");
      setDraft("");
      attachments.resetAfterSend();
      if (radarItemId) {
        await fetch(`/api/crm/radar/${radarItemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "DONE" }),
        }).catch(() => {});
      }
      onSent();
    } catch {
      toast.error("No se pudo enviar la respuesta");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Spinner className="mx-auto" />;
  if (to.length === 0 && !replyAll) return null; // hilo sin inbound: responder no aplica

  return (
    <div id="correo-suggested-reply" className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-tint-violet-fg" />
        <p className="text-[13px] font-semibold text-ds-text-1">Respuesta sugerida por IA</p>
      </div>
      <ReplyRecipientsField label="Para" values={to} onChange={setTo} />
      <div className="flex items-center gap-3">
        {replyAllVisible && (
          <button
            type="button"
            onClick={applyReplyAll}
            className="inline-flex items-center gap-1 text-[12px] text-ds-text-2 underline underline-offset-2 ds-tap"
          >
            <Users className="h-3.5 w-3.5" /> Responder a todos
          </button>
        )}
        {!showCcBcc && (
          <button
            type="button"
            onClick={() => setShowCcBcc(true)}
            className="text-[12px] text-ds-text-3 underline underline-offset-2 ds-tap"
          >
            CC/CCO
          </button>
        )}
      </div>
      {showCcBcc && (
        <>
          <ReplyRecipientsField label="CC" values={cc} onChange={setCc} />
          <ReplyRecipientsField label="CCO" values={bcc} onChange={setBcc} />
        </>
      )}
      <div className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-[12px] text-ds-text-3">Asunto</span>
        <input
          value={replySubject}
          onChange={(e) => setReplySubject(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1"
        />
      </div>
      <RichTextEditor
        value={draft}
        onChange={setDraft}
        placeholder="Escribí o generá una respuesta…"
      />
      <AttachmentPicker
        items={attachments.items}
        onFiles={attachments.addFiles}
        onRemove={attachments.remove}
        onRetry={attachments.retry}
        disabled={busy !== null}
      />
      <input
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Indicaciones para la IA (opcional): ej. proponé reunión el jueves…"
        className="h-9 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={suggest}
          disabled={busy !== null}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ds-border-default px-3 text-[13px] ds-tap disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" /> {busy === "gen" ? "Generando…" : "Sugerir"}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={busy !== null || !canSend}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground ds-tap disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> {busy === "send" ? "Enviando…" : "Enviar respuesta"}
        </button>
      </div>
    </div>
  );
}
