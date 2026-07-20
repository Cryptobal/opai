"use client";

import { useEffect, useState } from "react";
import { Sparkles, Send } from "lucide-react";
import { Spinner } from "@/components/opai-ds";

type Props = { threadId: string; subject: string; onSent: () => void };

/**
 * Sección "Respuesta sugerida por IA" del drawer: textarea editable precargado
 * con el borrador del radar (o generado on-demand) + envío en el mismo hilo.
 * Al enviar: marca el RadarItem DONE y refresca el timeline.
 */
export function SuggestedReplyPanel({ threadId, subject, onSent }: Props) {
  const [to, setTo] = useState<string | null>(null);
  const [radarItemId, setRadarItemId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"gen" | "send" | null>(null);

  useEffect(() => {
    fetch(`/api/crm/correos/${threadId}/suggest-reply`)
      .then((r) => r.json())
      .then((d) => {
        setTo(d.to ?? null);
        setRadarItemId(d.radarItemId ?? null);
        if (d.draft) setDraft(d.draft);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [threadId]);

  async function suggest() {
    setBusy("gen");
    try {
      const d = await fetch(`/api/crm/correos/${threadId}/suggest-reply`, { method: "POST" }).then((r) => r.json());
      if (d.draft) setDraft(d.draft);
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!to || !draft.trim()) return;
    setBusy("send");
    try {
      const reSubject = subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
      const res = await fetch("/api/crm/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, to, subject: reSubject, html: draft.replace(/\n/g, "<br>") }),
      });
      if (res.ok) {
        if (radarItemId) {
          await fetch(`/api/crm/radar/${radarItemId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "DONE" }),
          }).catch(() => {});
        }
        onSent();
      }
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Spinner className="mx-auto" />;
  if (!to) return null; // hilo sin inbound: responder no aplica

  return (
    <div className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-tint-violet-fg" />
        <p className="text-[13px] font-semibold text-ds-text-1">Respuesta sugerida por IA</p>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={5}
        placeholder="Escribí o generá una respuesta…"
        className="w-full resize-y rounded-lg border border-ds-border-default bg-ds-surface-1 p-2 text-[13px] text-ds-text-1"
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
          disabled={busy !== null || !draft.trim()}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground ds-tap disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> {busy === "send" ? "Enviando…" : "Enviar respuesta"}
        </button>
      </div>
    </div>
  );
}
