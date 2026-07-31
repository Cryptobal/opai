"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Paperclip,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/opai-ds";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useVisualViewportFrame } from "@/hooks/useVisualViewportFrame";
import {
  hideKeyboardAccessoryBar,
  subscribeHideKeyboardAccessoryBar,
} from "@/lib/capacitor/hideKeyboardAccessoryBar";
import {
  EmailComposer,
  type EmailComposerHandle,
  type ForwardAttachmentRefClient,
} from "./EmailComposer";
import { plainTextToTiptapDoc } from "./email-inline-images";
import { docPlainText } from "./composer-draft";
import {
  ComposerAiAssistToggle,
  ComposerAiPromptPill,
  type DraftRefineMode,
} from "./ComposerAiAssist";
import { CorreoComposerMoreSheet } from "./CorreoComposerMoreSheet";
import { CorreoAttachSheet } from "./CorreoAttachSheet";
import type { CorreoMessageDTO } from "@/modules/crm/email/correos.types";
import { emailPlainFallback, sanitizeEmailHtml } from "@/lib/sanitize-email-html";
import type { ComposerMode } from "./ComposerModeSwitcher";
import type { CorreoShortcuts } from "./useCorreosViewPreferences";
import { splitDraftBodyAndQuote } from "./correo-quoted-history";

export type { ComposerMode };
export type ReplyAll = { to: string[]; cc: string[] };

/** Borrador del hilo a retomar en el composer (providerDraftId + cuerpo). */
export type ThreadDraftSeed = Pick<
  CorreoMessageDTO,
  "providerDraftId" | "toEmails" | "ccEmails" | "subject" | "htmlBody" | "textBody"
>;

type Props = {
  threadId: string;
  subject: string;
  accountId: string | null;
  dealId: string | null;
  contactId?: string | null;
  to: string[];
  replyAll: ReplyAll | null;
  threadDraft?: ThreadDraftSeed | null;
  /** Historial citado (sanitizado) para reply / reply-all / forward. */
  quotedHtml: string;
  forwardAttachments: ForwardAttachmentRefClient[];
  mode: ComposerMode;
  ai: boolean;
  expanded: boolean;
  onModeChange: (mode: ComposerMode) => void;
  onToggleAi: () => void;
  onToggleExpand: () => void;
  onClose: () => void;
  onSent: () => void;
  onArchiveAfterSend?: () => void;
  onDraftDiscarded?: () => void;
  onOpenAiStyle?: () => void;
  onOpenSignature?: () => void;
  shortcuts?: CorreoShortcuts;
};

function defaultSubject(mode: ComposerMode, subject: string): string {
  if (mode === "forward") return subject.toLowerCase().startsWith("fwd:") ? subject : `Fwd: ${subject}`;
  return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
}

function seedFromThreadDraft(draft: ThreadDraftSeed): {
  doc: object;
  subject: string;
  draftId: string | null;
  to: string[];
  cc: string[];
  /** Quote embebido en borradores viejos (ya sanitizado); null si no había. */
  quotedHistoryHtml: string | null;
} {
  const split = splitDraftBodyAndQuote(draft.htmlBody);
  // Si el borrador traía gmail_quote, el cuerpo editable es solo la parte previa
  // (sin textBody completo, que repetiría el historial en plano).
  const plain = split.quotedHtml
    ? emailPlainFallback(split.bodyHtml, null)
    : emailPlainFallback(draft.htmlBody, draft.textBody);
  const quotedHistoryHtml = split.quotedHtml
    ? sanitizeEmailHtml(split.quotedHtml, { blockRemoteImages: true }) || null
    : null;
  return {
    doc: plainTextToTiptapDoc(plain === "(sin contenido)" && split.quotedHtml ? "" : plain),
    subject: draft.subject || "",
    draftId: draft.providerDraftId ?? null,
    to: draft.toEmails ?? [],
    cc: draft.ccEmails ?? [],
    quotedHistoryHtml,
  };
}

/**
 * Composer del lector. Desktop: expandir = modal centrado. Móvil (`<lg`):
 * siempre full-screen con topbar Gmail (✕ · ✨ · 📎 · Enviar · ⋯).
 */
export function CorreoComposerBox(props: Props) {
  const { threadId, subject, mode, ai, replyAll, to, expanded, threadDraft = null } = props;
  const initialSeed = threadDraft ? seedFromThreadDraft(threadDraft) : null;
  const bodyRef = useRef<object | null>(initialSeed?.doc ?? null);
  const subjectRef = useRef<string>(initialSeed?.subject ?? "");
  const draftIdRef = useRef<string | null>(initialSeed?.draftId ?? null);
  const aiSeededRef = useRef(false);
  const composerRef = useRef<EmailComposerHandle | null>(null);
  const [seed, setSeed] = useState<object | null>(initialSeed?.doc ?? null);
  const [epoch, setEpoch] = useState(0);
  const [instructions, setInstructions] = useState("");
  const instructionsRef = useRef("");
  const [generating, setGenerating] = useState(false);
  const [hasAiDraft, setHasAiDraft] = useState(() =>
    Boolean(initialSeed && docPlainText(initialSeed.doc).trim()),
  );
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [moreOpen, setMoreOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [scheduleNonce, setScheduleNonce] = useState(0);
  const [sendBusy, setSendBusy] = useState(false);
  const vv = useVisualViewportFrame();

  const isForward = mode === "forward";
  const asModal = expanded && isDesktop;
  const asMobileFs = !isDesktop;

  // iOS: sin barra ◀▶✓ del sistema; el Enviar vive en nuestra topbar.
  // Re-ocultar en cada keyboardWillShow (iOS la reactiva al enfocar inputs).
  useEffect(() => {
    if (!asMobileFs) return;
    void hideKeyboardAccessoryBar();
    return subscribeHideKeyboardAccessoryBar();
  }, [asMobileFs]);
  const showAiPrompt = ai;
  const replyAllAvailable = Boolean(
    replyAll &&
      (replyAll.cc.length > 0 ||
        replyAll.to.some((e) => !to.includes(e)) ||
        replyAll.to.length !== to.length),
  );
  const recipients =
    mode === "all" && replyAll
      ? { to: replyAll.to, cc: replyAll.cc }
      : isForward
        ? { to: [] as string[], cc: [] as string[] }
        : initialSeed
          ? { to: initialSeed.to, cc: initialSeed.cc }
          : { to, cc: [] as string[] };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (moreOpen || attachOpen) {
        e.preventDefault();
        e.stopPropagation();
        setMoreOpen(false);
        setAttachOpen(false);
        return;
      }
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
        if (composerRef.current) void composerRef.current.requestDiscard();
        else props.onClose();
      }
    }
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, [asModal, showAiPrompt, props, moreOpen, attachOpen]);

  function reseed() {
    setSeed(bodyRef.current);
  }

  function injectDraft(text: string) {
    const doc = plainTextToTiptapDoc(text);
    bodyRef.current = doc;
    setSeed(doc);
    setEpoch((e) => e + 1);
    setHasAiDraft(true);
    instructionsRef.current = "";
    setInstructions("");
  }

  function setAiInstructions(value: string) {
    instructionsRef.current = value;
    setInstructions(value);
  }

  async function runAi(opts?: { refine?: DraftRefineMode }) {
    // Ref: Enter justo después de tipear puede correr antes del re-render.
    const prompt = instructionsRef.current.trim();
    const currentDraft = docPlainText(bodyRef.current).trim();
    const refine = opts?.refine;
    if (refine == null && hasAiDraft && !prompt) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/crm/correos/${threadId}/suggest-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructions: prompt || undefined,
          currentDraft:
            refine || (hasAiDraft && currentDraft) ? currentDraft || undefined : undefined,
          refine: refine || undefined,
        }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        draft?: unknown;
        error?: string;
        title?: string;
      };
      if (!res.ok || !d.draft) {
        toast.error(d.title || "No se pudo generar el borrador", {
          description: d.error || "Reintentá en unos segundos.",
        });
        return;
      }
      injectDraft(String(d.draft));
    } catch {
      toast.error("No se pudo generar el borrador", {
        description: "Sin conexión o error inesperado. Reintentá.",
      });
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (!showAiPrompt) {
      if (!ai) {
        aiSeededRef.current = false;
        instructionsRef.current = "";
        setInstructions("");
      }
      return;
    }
    if (aiSeededRef.current) return;
    aiSeededRef.current = true;
    if (docPlainText(bodyRef.current).trim()) setHasAiDraft(true);
  }, [showAiPrompt, ai]);

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

  async function handleSend() {
    setSendBusy(true);
    try {
      await composerRef.current?.send();
    } finally {
      setSendBusy(false);
    }
  }

  const composer = (
    <EmailComposer
      key={`${threadId}:${mode}:${initialSeed?.draftId ?? "new"}`}
      ref={composerRef}
      mode={isForward ? "forward" : "reply"}
      threadId={isForward ? null : threadId}
      initialTo={recipients.to}
      initialCc={recipients.cc}
      initialSubject={subjectRef.current || defaultSubject(mode, subject)}
      replyAll={mode === "reply" ? replyAll : null}
      initialContent={seed}
      contentEpoch={epoch}
      resumeDraftId={draftIdRef.current}
      quotedHtml={initialSeed?.quotedHistoryHtml || props.quotedHtml || null}
      quoteMode={isForward ? "forward" : "reply"}
      forwardFromThreadId={isForward ? threadId : null}
      forwardAttachments={isForward ? props.forwardAttachments : []}
      accountId={props.accountId}
      dealId={props.dealId}
      contactId={props.contactId ?? null}
      modeSwitcher={{ mode, replyAllAvailable, onChange: switchMode }}
      onBodyChange={(doc) => { bodyRef.current = doc; }}
      onSubjectChange={(s) => { subjectRef.current = s; }}
      onDraftIdChange={(id) => { draftIdRef.current = id; }}
      onOpenSignature={props.onOpenSignature}
      onOpenAiStyle={props.onOpenAiStyle}
      mobileChrome={asMobileFs}
      openScheduleNonce={scheduleNonce}
      onOpenComposerMore={() => setMoreOpen(true)}
      aboveFooter={
        showAiPrompt ? (
          <ComposerAiPromptPill
            value={instructions}
            onChange={setAiInstructions}
            onGenerate={() => void runAi()}
            onRefine={(preset) => void runAi({ refine: preset })}
            onClose={closeAi}
            generating={generating}
            hasDraft={hasAiDraft}
            onOpenStyle={props.onOpenAiStyle}
            mode={isForward ? "compose" : "reply"}
          />
        ) : null
      }
      footerExtras={
        <ComposerAiAssistToggle
          open={ai}
          onToggle={props.onToggleAi}
          disabled={generating}
          mode={isForward ? "compose" : "reply"}
        />
      }
      onSent={props.onSent}
      onArchiveAfterSend={props.onArchiveAfterSend}
      onClose={props.onClose}
      onDraftDiscarded={props.onDraftDiscarded}
      shortcuts={props.shortcuts}
    />
  );

  const sheets = (
    <>
      <CorreoComposerMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        canSendAndArchive={Boolean(props.onArchiveAfterSend)}
        onSendAndArchive={() => void composerRef.current?.sendAndArchive()}
        onSchedule={() => setScheduleNonce((n) => n + 1)}
        onOpenSignature={props.onOpenSignature}
        onOpenAiStyle={props.onOpenAiStyle}
        onDiscard={() => void composerRef.current?.requestDiscard()}
      />
      <CorreoAttachSheet
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        onFiles={(files) => composerRef.current?.addFiles(files)}
      />
    </>
  );

  if (asMobileFs) {
    // Anclado al visualViewport: con teclado iOS, inset-0 deja la topbar
    // (Enviar) fuera de pantalla; top/height del VV la mantienen visible.
    const fsStyle = {
      top: vv.top,
      height: vv.height || "100dvh",
      // Con teclado el VV ya excluye el notch inferior; sin teclado respetamos
      // safe-area vía padding del header/scroll.
    } as const;
    const headerPadTop =
      vv.keyboardInset > 0
        ? "0.5rem"
        : "calc(env(safe-area-inset-top, 0px) + 0.5rem)";

    return createPortal(
      <div
        className="fixed inset-x-0 z-[60] flex flex-col bg-background"
        style={fsStyle}
        role="dialog"
        aria-modal="true"
        aria-label="Redactar correo"
      >
        {/* Sin h-* fijo: el pt safe-area debe sumar altura, no comerse la fila
            de botones (antes h-14 + pt dejaba los controles pegados al notch). */}
        <header
          className="opai-glass-strong flex shrink-0 items-center gap-0.5 border-b border-ds-border-subtle px-2 pb-2"
          style={{ paddingTop: headerPadTop }}
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => void composerRef.current?.requestDiscard()}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ds-text-2 ds-tap"
          >
            <X className="h-5 w-5" />
          </button>
          <span className="min-w-0 flex-1" />
          <button
            type="button"
            aria-label="Asistente IA"
            aria-pressed={ai}
            onClick={props.onToggleAi}
            className={`flex h-11 w-11 items-center justify-center rounded-full ds-tap ${
              ai ? "bg-tint-violet/15 text-tint-violet-fg" : "text-ds-text-2"
            }`}
          >
            <Sparkles className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Adjuntar"
            onClick={() => setAttachOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ds-text-2 ds-tap"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Enviar"
            disabled={sendBusy}
            onClick={() => void handleSend()}
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground ds-tap disabled:opacity-50"
          >
            {sendBusy ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            Enviar
          </button>
          <button
            type="button"
            aria-label="Más opciones"
            onClick={() => setMoreOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ds-text-2 ds-tap"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </header>
        <div
          id="correo-suggested-reply"
          data-email-composer
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 [-webkit-overflow-scrolling:touch]"
        >
          {composer}
        </div>
        {sheets}
      </div>,
      document.body,
    );
  }

  const desktopChrome = (
    <>
      <div className="flex items-center justify-end gap-0.5">
        <button
          type="button"
          aria-label={asModal ? "Contraer" : "Expandir"}
          title={asModal ? "Contraer" : "Expandir"}
          onClick={toggleExpand}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ds-text-3 ds-tap hover:bg-ds-surface-2 hover:text-ds-text-1"
        >
          {asModal ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={props.onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ds-text-3 ds-tap hover:bg-ds-surface-2 hover:text-ds-text-1"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {composer}
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
          {desktopChrome}
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <div
      id="correo-suggested-reply"
      data-email-composer
      className="space-y-1 border-t border-ds-border-subtle bg-background pt-2"
    >
      {desktopChrome}
    </div>
  );
}
