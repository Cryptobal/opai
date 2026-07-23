"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Spinner } from "@/components/opai-ds";
import { EmailComposer } from "./EmailComposer";
import { plainTextToTiptapDoc } from "./email-inline-images";

type ReplyAll = { to: string[]; cc: string[] };
type Props = { threadId: string; subject: string; onSent: () => void };

/**
 * Panel de respuesta del lector (drawer): composer unificado Tiptap (C13) +
 * "Respuesta sugerida por IA" del radar (precargada o generada on-demand con
 * indicaciones). El envío corre por el outbox (deshacer/programar) y el
 * autosave a Gmail Drafts protege el trabajo.
 */
export function SuggestedReplyPanel({ threadId, subject, onSent }: Props) {
  const [to, setTo] = useState<string[]>([]);
  const [replyAll, setReplyAll] = useState<ReplyAll | null>(null);
  const [radarItemId, setRadarItemId] = useState<string | null>(null);
  const [draftDoc, setDraftDoc] = useState<object | null>(null);
  const [draftEpoch, setDraftEpoch] = useState(0);
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch(`/api/crm/correos/${threadId}/suggest-reply`)
      .then((r) => r.json())
      .then((d) => {
        setTo(d.to ? [String(d.to).toLowerCase()] : []);
        setReplyAll(d.replyAll ?? null);
        setRadarItemId(d.radarItemId ?? null);
        if (d.draft) {
          setDraftDoc(plainTextToTiptapDoc(String(d.draft)));
          setDraftEpoch((v) => v + 1);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [threadId]);

  async function suggest() {
    setGenerating(true);
    try {
      const d = await fetch(`/api/crm/correos/${threadId}/suggest-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions: instructions.trim() || undefined }),
      }).then((r) => r.json());
      if (d.draft) {
        setDraftDoc(plainTextToTiptapDoc(String(d.draft)));
        setDraftEpoch((v) => v + 1);
      }
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <Spinner className="mx-auto" />;
  if (to.length === 0 && !replyAll) return null; // hilo sin inbound: responder no aplica

  return (
    <div
      id="correo-suggested-reply"
      className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-3"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-tint-violet-fg" />
        <p className="text-[13px] font-semibold text-ds-text-1">Responder</p>
      </div>
      <EmailComposer
        key={threadId}
        mode="reply"
        threadId={threadId}
        initialTo={to}
        replyAll={replyAll}
        initialSubject={subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`}
        initialContent={draftDoc}
        contentEpoch={draftEpoch}
        onSent={() => {
          if (radarItemId) {
            void fetch(`/api/crm/radar/${radarItemId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "DONE" }),
            }).catch(() => {});
          }
          onSent();
        }}
      />
      <div className="flex items-center gap-2">
        <input
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Indicaciones para la IA (opcional): ej. proponé reunión el jueves…"
          className="h-9 min-w-0 flex-1 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1"
        />
        <button
          type="button"
          onClick={suggest}
          disabled={generating}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-ds-border-default px-3 text-[13px] ds-tap disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" /> {generating ? "Generando…" : "Sugerir con IA"}
        </button>
      </div>
    </div>
  );
}
