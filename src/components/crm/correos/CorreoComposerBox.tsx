"use client";

import { useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { EmailComposer, type ForwardAttachmentRefClient } from "./EmailComposer";
import { plainTextToTiptapDoc } from "./email-inline-images";

export type ComposerMode = "reply" | "all" | "forward";
export type ReplyAll = { to: string[]; cc: string[] };

type Props = {
  threadId: string;
  subject: string;
  accountId: string | null;
  dealId: string | null;
  to: string[];
  replyAll: ReplyAll | null;
  radarItemId: string | null;
  preDraft: string | null;
  forwardQuotedHtml: string;
  forwardAttachments: ForwardAttachmentRefClient[];
  mode: ComposerMode;
  ai: boolean;
  onModeChange: (mode: ComposerMode) => void;
  onToggleAi: () => void;
  onClose: () => void;
  onSent: () => void;
  /** Bloque 3: cabecera con botón expandir (modal desktop / fullscreen móvil). */
  headerExtra?: React.ReactNode;
};

function defaultSubject(mode: ComposerMode, subject: string): string {
  if (mode === "forward") return subject.toLowerCase().startsWith("fwd:") ? subject : `Fwd: ${subject}`;
  return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
}

/**
 * Composer abierto del lector (Bloque 2): tabs de modo (Responder / A todos /
 * Reenviar) + pill ✦ IA que alterna el asistente sobre el modo actual. Cambiar
 * de modo preserva cuerpo y asunto (se re-montan con los últimos valores vía
 * refs) sin duplicar el borrador de Gmail (resumeDraftId). El envío/outbox y el
 * autosave del EmailComposer no se tocan.
 */
export function CorreoComposerBox(props: Props) {
  const { threadId, subject, mode, ai, replyAll, to } = props;
  const bodyRef = useRef<object | null>(null);
  const subjectRef = useRef<string>("");
  const draftIdRef = useRef<string | null>(null);
  const [seed, setSeed] = useState<object | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [instructions, setInstructions] = useState("");
  const [generating, setGenerating] = useState(false);

  const isForward = mode === "forward";
  const recipients =
    mode === "all" && replyAll
      ? { to: replyAll.to, cc: replyAll.cc }
      : mode === "forward"
        ? { to: [] as string[], cc: [] as string[] }
        : { to, cc: [] as string[] };

  function injectDraft(text: string) {
    const doc = plainTextToTiptapDoc(text);
    bodyRef.current = doc;
    setSeed(doc);
    setEpoch((e) => e + 1);
  }

  async function generate() {
    setGenerating(true);
    try {
      const d = await fetch(`/api/crm/correos/${threadId}/suggest-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions: instructions.trim() || undefined }),
      }).then((r) => r.json());
      if (d.draft) injectDraft(String(d.draft));
    } finally {
      setGenerating(false);
    }
  }

  function switchMode(next: ComposerMode) {
    // Preservar el cuerpo escrito: se re-siembra con lo último editado.
    setSeed(bodyRef.current);
    props.onModeChange(next);
  }

  function toggleAi() {
    const next = !ai;
    props.onToggleAi();
    // Al activar la IA sin borrador previo, generar automáticamente.
    if (next && !bodyRef.current) {
      if (props.preDraft) injectDraft(props.preDraft);
      else void generate();
    }
  }

  return (
    <div id="correo-suggested-reply" className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-2.5">
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1 rounded-lg bg-ds-surface-1 p-0.5">
          <ModeTab active={mode === "reply"} onClick={() => switchMode("reply")}>Responder</ModeTab>
          {replyAll && (
            <ModeTab active={mode === "all"} onClick={() => switchMode("all")}>A todos</ModeTab>
          )}
          <ModeTab active={mode === "forward"} onClick={() => switchMode("forward")}>Reenviar</ModeTab>
        </div>
        {!isForward && (
          <button
            type="button"
            onClick={toggleAi}
            aria-pressed={ai}
            className={`inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium ds-tap ${
              ai
                ? "bg-tint-violet/25 text-tint-violet-fg"
                : "border border-ds-border-default text-ds-text-2 hover:text-ds-text-1"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" /> IA
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          {props.headerExtra}
          <button
            type="button"
            aria-label="Cerrar"
            onClick={props.onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ds-text-3 ds-tap hover:bg-ds-surface-3 hover:text-ds-text-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {ai && !isForward && (
        <div className="flex items-center gap-2">
          <input
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Indicaciones para la IA (opcional): ej. proponé reunión el jueves…"
            className="h-9 min-w-0 flex-1 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[16px] text-ds-text-1 sm:text-[13px]"
          />
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-ds-border-default px-3 text-[13px] ds-tap disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" /> {generating ? "Generando…" : "Regenerar"}
          </button>
        </div>
      )}

      <EmailComposer
        key={`${threadId}:${mode}`}
        mode={isForward ? "forward" : "reply"}
        threadId={isForward ? null : threadId}
        initialTo={recipients.to}
        initialCc={recipients.cc}
        initialSubject={subjectRef.current || defaultSubject(mode, subject)}
        replyAll={mode === "reply" ? replyAll : null}
        initialContent={seed}
        contentEpoch={epoch}
        resumeDraftId={draftIdRef.current}
        quotedHtml={isForward ? props.forwardQuotedHtml : null}
        forwardFromThreadId={isForward ? threadId : null}
        forwardAttachments={isForward ? props.forwardAttachments : []}
        accountId={props.accountId}
        dealId={props.dealId}
        onBodyChange={(doc) => {
          bodyRef.current = doc;
        }}
        onSubjectChange={(s) => {
          subjectRef.current = s;
        }}
        onDraftIdChange={(id) => {
          draftIdRef.current = id;
        }}
        onSent={() => {
          if (props.radarItemId) {
            void fetch(`/api/crm/radar/${props.radarItemId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "DONE" }),
            }).catch(() => {});
          }
          props.onSent();
        }}
        onClose={props.onClose}
      />
    </div>
  );
}

function ModeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-9 rounded-md px-3 text-[13px] font-medium ds-tap ${
        active ? "bg-ds-surface-3 text-ds-text-1" : "text-ds-text-3 hover:text-ds-text-1"
      }`}
    >
      {children}
    </button>
  );
}
