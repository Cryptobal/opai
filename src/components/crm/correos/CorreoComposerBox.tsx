"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, Sparkles, X } from "lucide-react";
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
 * Composer abierto del lector (Bloques 2/3): tabs de modo + pill ✦ IA, y
 * botón Expandir (modal grande centrado en desktop; fullscreen en móvil, donde
 * el botón se oculta). Cambiar de modo o expandir preserva cuerpo/asunto vía
 * refs (re-siembra en el re-montaje) sin duplicar el borrador de Gmail. Esc en
 * dos pasos: colapsa el modal y luego cierra el composer, sin cerrar el lector.
 */
export function CorreoComposerBox(props: Props) {
  const { threadId, subject, mode, ai, replyAll, to, expanded } = props;
  const bodyRef = useRef<object | null>(null);
  const subjectRef = useRef<string>("");
  const draftIdRef = useRef<string | null>(null);
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
  const recipients =
    mode === "all" && replyAll
      ? { to: replyAll.to, cc: replyAll.cc }
      : isForward
        ? { to: [] as string[], cc: [] as string[] }
        : { to, cc: [] as string[] };

  // Esc en dos pasos: capture para preempt al focus-trap del lector (que en
  // burbuja cerraría el lector). Primero colapsa el modal; luego cierra.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
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
  }, [asModal, props]);

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

  function switchMode(next: ComposerMode) {
    reseed();
    // Responder / A todos / Reenviar apagan IA: el rectángulo de indicaciones
    // solo vive en el tab IA (exclusivo).
    props.onModeChange(next);
  }

  function toggleExpand() {
    reseed();
    props.onToggleExpand();
  }

  /** Activa el tab IA (exclusivo). Si ya está activo, no-op; para salir usar Responder/A todos/Reenviar. */
  function activateAi() {
    if (ai) return;
    props.onToggleAi();
    if (!bodyRef.current) {
      if (props.preDraft) injectDraft(props.preDraft);
      else void generate();
    }
  }

  // Rectángulo de indicaciones solo con tab IA activo (no en Responder/A todos/Reenviar).
  const showAiInstructions = ai && !isForward;

  const inner = (
    <>
      <div className="flex items-center gap-1 border-b border-ds-border-subtle pb-1">
        <ModeTab active={!ai && mode === "reply"} onClick={() => switchMode("reply")}>Responder</ModeTab>
        {replyAll && <ModeTab active={!ai && mode === "all"} onClick={() => switchMode("all")}>A todos</ModeTab>}
        <ModeTab active={!ai && mode === "forward"} onClick={() => switchMode("forward")}>Reenviar</ModeTab>
        {!isForward && (
          <button
            type="button"
            onClick={activateAi}
            aria-pressed={ai}
            className={`ml-1 inline-flex h-9 items-center gap-1 border-b-2 px-2.5 text-[13px] font-medium ds-tap ${
              ai
                ? "border-primary text-tint-violet-fg"
                : "border-transparent text-ds-text-3 hover:text-ds-text-1"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" /> IA
          </button>
        )}
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

      {showAiInstructions && (
        <div className="flex items-center gap-2 border-b border-ds-border-subtle pb-1">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-tint-violet-fg" />
          <input
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!generating) void generate();
              }
            }}
            placeholder="Indicaciones para la IA (opcional)…"
            className="h-9 min-w-0 flex-1 bg-transparent px-0 text-[16px] text-ds-text-1 outline-none placeholder:text-ds-text-4 sm:text-[13px]"
          />
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating}
            className="inline-flex h-9 shrink-0 items-center gap-1 px-1.5 text-[12px] text-ds-text-2 ds-tap hover:text-ds-text-1 disabled:opacity-50"
          >
            {generating ? "Generando…" : "Regenerar"}
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
        onBodyChange={(doc) => { bodyRef.current = doc; }}
        onSubjectChange={(s) => { subjectRef.current = s; }}
        onDraftIdChange={(id) => { draftIdRef.current = id; }}
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
