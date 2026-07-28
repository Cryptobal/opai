"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, X } from "lucide-react";
import { EmailComposer, type ForwardAttachmentRefClient } from "./EmailComposer";
import { plainTextToTiptapDoc } from "./email-inline-images";
import {
  ComposerAiAssistToggle,
  ComposerAiPromptPill,
} from "./ComposerAiAssist";

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
  /** Panel de prompt IA abierto (estilo Gmail; independiente del modo). */
  ai: boolean;
  expanded: boolean;
  onModeChange: (mode: ComposerMode) => void;
  onToggleAi: () => void;
  onToggleExpand: () => void;
  onClose: () => void;
  onSent: () => void;
};

function defaultSubject(mode: ComposerMode, subject: string): string {
  if (mode === "forward") return subject.toLowerCase().startsWith("fwd:") ? subject : `Fwd: ${subject}`;
  return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
}

/**
 * Composer abierto del lector: tabs Responder / A todos / Reenviar + asistente
 * IA estilo Gmail (pill sobre el footer, toggle lápiz+estrella abajo). Expandir
 * = modal grande en desktop / fullscreen en móvil. Esc: cierra IA → colapsa
 * modal → cierra composer.
 */
export function CorreoComposerBox(props: Props) {
  const { threadId, subject, mode, ai, replyAll, to, expanded } = props;
  const bodyRef = useRef<object | null>(null);
  const subjectRef = useRef<string>("");
  const draftIdRef = useRef<string | null>(null);
  const aiSeededRef = useRef(false);
  const [seed, setSeed] = useState<object | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [instructions, setInstructions] = useState("");
  const [generating, setGenerating] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const isForward = mode === "forward";
  const asModal = expanded && isDesktop;
  const showAiAssist = !isForward;
  const showAiPrompt = showAiAssist && ai;
  const recipients =
    mode === "all" && replyAll
      ? { to: replyAll.to, cc: replyAll.cc }
      : isForward
        ? { to: [] as string[], cc: [] as string[] }
        : { to, cc: [] as string[] };

  // Esc en tres pasos: IA → modal → cerrar. Capture para preempt al focus-trap
  // del lector (que en burbuja cerraría el lector).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showAiPrompt) {
        e.preventDefault();
        e.stopPropagation();
        props.onToggleAi();
        return;
      }
      if (asModal) {
        e.preventDefault();
        e.stopPropagation();
        props.onToggleExpand();
      } else {
        e.preventDefault();
        e.stopPropagation();
        props.onClose();
      }
    }
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, [asModal, showAiPrompt, props]);

  function reseed() {
    setSeed(bodyRef.current);
  }

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

  // Al abrir el asistente: si hay preDraft cacheado y el cuerpo está vacío,
  // sembrarlo. No auto-generar (Gmail: el usuario escribe el prompt y manda ↑).
  useEffect(() => {
    if (!showAiPrompt) {
      if (!ai) aiSeededRef.current = false;
      return;
    }
    if (aiSeededRef.current) return;
    aiSeededRef.current = true;
    if (bodyRef.current || !props.preDraft) return;
    injectDraft(props.preDraft);
  }, [showAiPrompt, ai, props.preDraft]);

  function switchMode(next: ComposerMode) {
    reseed();
    props.onModeChange(next);
  }

  function toggleExpand() {
    reseed();
    props.onToggleExpand();
  }

  function closeAi() {
    if (ai) props.onToggleAi();
  }

  const inner = (
    <>
      <div className="flex items-center gap-1 border-b border-ds-border-subtle pb-1">
        <ModeTab active={mode === "reply"} onClick={() => switchMode("reply")}>Responder</ModeTab>
        {replyAll && <ModeTab active={mode === "all"} onClick={() => switchMode("all")}>A todos</ModeTab>}
        <ModeTab active={mode === "forward"} onClick={() => switchMode("forward")}>Reenviar</ModeTab>
        <div className="ml-auto flex items-center">
          {isDesktop && (
            <button
              type="button"
              aria-label={asModal ? "Contraer" : "Expandir"}
              title={asModal ? "Contraer" : "Expandir"}
              onClick={toggleExpand}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ds-text-3 ds-tap hover:bg-ds-surface-2 hover:text-ds-text-1"
            >
              {asModal ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            aria-label="Cerrar"
            onClick={props.onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ds-text-3 ds-tap hover:bg-ds-surface-2 hover:text-ds-text-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

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
        onBodyChange={(doc) => { bodyRef.current = doc; }}
        onSubjectChange={(s) => { subjectRef.current = s; }}
        onDraftIdChange={(id) => { draftIdRef.current = id; }}
        aboveFooter={
          showAiPrompt ? (
            <ComposerAiPromptPill
              value={instructions}
              onChange={setInstructions}
              onGenerate={() => void generate()}
              onClose={closeAi}
              generating={generating}
            />
          ) : null
        }
        footerExtras={
          showAiAssist ? (
            <ComposerAiAssistToggle
              open={ai}
              onToggle={props.onToggleAi}
              disabled={generating}
            />
          ) : null
        }
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
    </>
  );

  if (asModal) {
    return createPortal(
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Redactar correo">
        <div className="absolute inset-0 bg-black/40" onClick={toggleExpand} aria-hidden />
        <div
          id="correo-suggested-reply"
          data-email-composer
          className="relative z-10 flex h-[min(84dvh,780px)] w-[min(820px,94vw)] flex-col gap-1 overflow-y-auto rounded-2xl border border-ds-border-default bg-background px-4 py-3 shadow-2xl"
        >
          {inner}
        </div>
      </div>,
      document.body,
    );
  }

  // Inline reply: fondo opaco del lector (sin glass) + divisores sutiles.
  return (
    <div
      id="correo-suggested-reply"
      data-email-composer
      className="space-y-1 border-t border-ds-border-subtle bg-background pt-2"
    >
      {inner}
    </div>
  );
}

function ModeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-9 border-b-2 px-2.5 text-[13px] font-medium ds-tap ${
        active
          ? "border-primary text-ds-text-1"
          : "border-transparent text-ds-text-3 hover:text-ds-text-1"
      }`}
    >
      {children}
    </button>
  );
}
