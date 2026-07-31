"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Spinner } from "@/components/opai-ds";
import { CorreoActionBar } from "./CorreoActionBar";
import {
  CorreoComposerBox,
  type ComposerMode,
  type ReplyAll,
  type ThreadDraftSeed,
} from "./CorreoComposerBox";
import type { ForwardAttachmentRefClient } from "./EmailComposer";
import type { CorreoAttachmentDTO, CorreoMessageDTO } from "@/modules/crm/email/correos.types";
import {
  DEFAULT_CORREO_SHORTCUTS,
  type CorreoShortcuts,
} from "./useCorreosViewPreferences";
import { normalizeRecipientList } from "./ReplyRecipientsField";
import type { ComposeIntent } from "./correo-reader-intent";
import { useCorreoReaderDock } from "./CorreoReaderDockContext";
import {
  resolveCorreoPrimaryAction,
  type CorreoPrimaryAction,
} from "./correo-primary-action";
import { buildQuotedMessageInnerHtml } from "./correo-quoted-history";
import { rewriteCidImages } from "./rewrite-cid-images";
import { sanitizeEmailHtml } from "@/lib/sanitize-email-html";

/** Contrato mínimo del reply box (CorreoDetail y EntityThreadDetail lo satisfacen). */
export type ReplyBoxDetail = {
  thread: {
    id: string;
    subject: string;
    accountId: string | null;
    dealId: string | null;
    contactId?: string | null;
  };
  messages: CorreoMessageDTO[];
  attachments: CorreoAttachmentDTO[];
};

type Meta = { to: string[]; replyAll: ReplyAll | null };

function normalizeReplyAll(ra: ReplyAll | null): ReplyAll | null {
  if (!ra) return null;
  return {
    to: normalizeRecipientList(ra.to ?? []),
    cc: normalizeRecipientList(ra.cc ?? []),
  };
}

/**
 * HTML citado del último mensaje no-borrador del hilo (reply / forward).
 * Sanitizado con el mismo pipeline del lector; cid: → URL del API.
 */
export function buildThreadQuotedHtml(detail: ReplyBoxDetail): string {
  let last: CorreoMessageDTO | undefined;
  for (let i = detail.messages.length - 1; i >= 0; i -= 1) {
    const m = detail.messages[i];
    if (m && !m.isDraft) {
      last = m;
      break;
    }
  }
  if (!last) return "";
  let bodyHtml = last.htmlBody;
  if (bodyHtml?.trim() && detail.attachments.length > 0) {
    bodyHtml = rewriteCidImages(
      bodyHtml,
      detail.thread.id,
      detail.attachments,
      last.providerMessageId ?? last.id,
    );
  }
  const inner = buildQuotedMessageInnerHtml({
    fromEmail: last.fromEmail,
    sentAt: last.sentAt,
    subject: last.subject,
    toEmails: last.toEmails,
    htmlBody: bodyHtml,
    textBody: last.textBody,
  });
  return sanitizeEmailHtml(inner, { blockRemoteImages: true });
}

function scrollComposerIntoView() {
  const run = () => {
    const surface = document.querySelector<HTMLElement>(
      "[data-correo-composer-surface]",
    );
    // Full-screen y modal cubren la pantalla: desplazar el lector no aporta
    // y en esas ramas la superficie es su propio scroller.
    const presentation = surface?.dataset.composerPresentation;
    if (presentation === "fullscreen" || presentation === "modal") return;

    const el = document.querySelector<HTMLElement>("[data-correo-reply-anchor]");
    if (!el) return;
    const scroller = document.querySelector<HTMLElement>(
      "[data-correo-reader-scroller]",
    );
    if (!scroller || !scroller.contains(el)) {
      el.scrollIntoView({ behavior: "smooth", block: "end" });
      return;
    }
    const elRect = el.getBoundingClientRect();
    const scRect = scroller.getBoundingClientRect();
    const nextTop = scroller.scrollTop + (elRect.bottom - scRect.bottom) + 24;
    scroller.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
  };
  window.requestAnimationFrame(() => window.requestAnimationFrame(run));
  window.setTimeout(run, 80);
}

/** Último borrador del hilo con id de Gmail (el que se puede descartar/reanudar). */
export function findThreadDraft(messages: CorreoMessageDTO[]): CorreoMessageDTO | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.isDraft && m.providerDraftId) return m;
  }
  return null;
}

function toThreadDraftSeed(m: CorreoMessageDTO): ThreadDraftSeed {
  return {
    providerDraftId: m.providerDraftId ?? null,
    toEmails: m.toEmails,
    ccEmails: m.ccEmails,
    subject: m.subject,
    htmlBody: m.htmlBody,
    textBody: m.textBody,
  };
}

/**
 * Orquesta la respuesta del lector (Bloque 2): barra de acciones Gmail (cerrado)
 * ⇄ composer con modos (abierto). IA = panel tipo Gmail (pill + toggle abajo),
 * abierto por defecto en Responder / A todos / Reenviar. Atajos R/A/F →
 * composeIntent (también con foco en el iframe del cuerpo).
 *
 * La barra de acciones se muestra de inmediato (sin esperar suggest-reply): el
 * meta se hidrata en background para no bloquear la lectura con un spinner.
 * Con dock del shell, se porta fuera del scroll (fija abajo, estilo Gmail).
 *
 * Si el hilo tiene un borrador, Responder/Continuar lo reanuda (mismo
 * providerDraftId) en vez de crear otro.
 */
export function CorreoReplyBox({
  detail,
  onSent,
  onArchiveAfterSend,
  shortcuts = DEFAULT_CORREO_SHORTCUTS,
  composeIntent = null,
  continueDraftIntent = null,
  onOpenAiStyle,
  onOpenSignature,
  onPrimaryActionChange,
  onOpenChange,
}: {
  detail: ReplyBoxDetail;
  onSent: () => void;
  /** Archiva el hilo tras ⌘/Ctrl+Enter (Enviar y archivar). */
  onArchiveAfterSend?: () => void;
  shortcuts?: CorreoShortcuts;
  /** Pedido externo (atajo desde bandeja / menú contextual). */
  composeIntent?: ComposeIntent | null;
  /** Continuar un borrador desde la card de la cadena. */
  continueDraftIntent?: { message: CorreoMessageDTO; nonce: number } | null;
  onOpenAiStyle?: () => void;
  onOpenSignature?: () => void;
  /**
   * Eleva la acción primaria resuelta (Responder/Reenviar + disponibilidad de
   * "A todos") para que la isla móvil no vuelva a pedir suggest-reply. `null`
   * mientras el meta carga o al cambiar de hilo.
   */
  onPrimaryActionChange?: (action: CorreoPrimaryAction | null) => void;
  /** Notifica apertura/cierre del composer (la isla se oculta al abrir). */
  onOpenChange?: (open: boolean) => void;
}) {
  const dock = useCorreoReaderDock();
  const threadId = detail.thread.id;
  const [meta, setMeta] = useState<Meta>({
    to: [],
    replyAll: null,
  });
  const [metaReady, setMetaReady] = useState(false);
  const [open, setOpen] = useState<{ mode: ComposerMode; ai: boolean; expanded: boolean } | null>(null);
  const [activeDraft, setActiveDraft] = useState<ThreadDraftSeed | null>(null);

  const threadDraft = useMemo(() => findThreadDraft(detail.messages), [detail.messages]);

  function openComposer(mode: ComposerMode, ai = false, draft: CorreoMessageDTO | null = threadDraft) {
    setActiveDraft(draft && mode !== "forward" ? toThreadDraftSeed(draft) : null);
    setOpen({ mode, ai, expanded: false });
  }

  // Al abrir Responder / A todos / Reenviar / IA, bajar al composer
  // (también cuando termina de cargar el meta y monta el box real).
  useEffect(() => {
    if (!open) return;
    scrollComposerIntoView();
  }, [open, metaReady]);

  // Notifica apertura/cierre del composer (isla móvil = exclusividad) vía ref.
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => {
    onOpenChangeRef.current?.(open !== null);
  }, [open]);

  useEffect(() => {
    setOpen(null);
    setActiveDraft(null);
    setMetaReady(false);
    let alive = true;
    fetch(`/api/crm/correos/${threadId}/suggest-reply`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const to = d.to ? normalizeRecipientList([String(d.to)]) : [];
        setMeta({
          to,
          replyAll: normalizeReplyAll(d.replyAll ?? null),
        });
      })
      .catch(() => {
        if (alive) setMeta({ to: [], replyAll: null });
      })
      .finally(() => {
        if (alive) setMetaReady(true);
      });
    return () => {
      alive = false;
    };
  }, [threadId]);

  // Intent externo: abrir composer aunque el meta aún esté cargando.
  useEffect(() => {
    if (!composeIntent) return;
    openComposer(composeIntent.mode, Boolean(composeIntent.ai));
    // nonce garantiza re-disparo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeIntent?.nonce]);

  // Continuar borrador desde la card de la cadena (papelera + Continuar).
  useEffect(() => {
    if (!continueDraftIntent) return;
    openComposer("reply", false, continueDraftIntent.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continueDraftIntent?.nonce]);

  const primaryAction = useMemo(() => resolveCorreoPrimaryAction(meta), [meta]);
  const { canReply, replyAllAvailable } = primaryAction;

  // Eleva la acción primaria al drawer/isla vía ref (evita re-ejecutar el
  // effect por identidad del callback). Null mientras el meta aún carga.
  const onPrimaryActionChangeRef = useRef(onPrimaryActionChange);
  onPrimaryActionChangeRef.current = onPrimaryActionChange;
  useEffect(() => {
    onPrimaryActionChangeRef.current?.(metaReady ? primaryAction : null);
  }, [metaReady, primaryAction]);

  const forwardAttachments: ForwardAttachmentRefClient[] = detail.attachments.map((a) => ({
    providerMessageId: a.messageId,
    attachmentId: a.attachmentId,
    fileName: a.filename,
    size: a.size,
  }));

  const quotedHtml = useMemo(() => buildThreadQuotedHtml(detail), [detail]);

  if (!open) {
    const bar = (
      <CorreoActionBar
        canReply={metaReady ? canReply : true}
        replyAllAvailable={metaReady ? replyAllAvailable : false}
        shortcuts={shortcuts}
        onReply={() => openComposer("reply", true)}
        onReplyAll={() => openComposer("all", true)}
        onForward={() => openComposer("forward", true)}
      />
    );
    // Dock del shell = fija abajo fuera del scroll (Gmail).
    // Si el shell está montando el host, no renderizar inline (evita flash).
    if (dock.enabled) {
      if (!dock.host) return null;
      return createPortal(bar, dock.host);
    }
    return bar;
  }

  // Composer abierto antes de que llegue el meta: spinner mínimo en el box.
  // Si reanudamos un borrador ya tenemos destinatarios/cuerpo — no bloquear.
  if (!metaReady && open.mode !== "forward" && !activeDraft) {
    return (
      <div data-correo-reply-anchor className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }

  return (
    <CorreoComposerBox
      threadId={threadId}
      subject={detail.thread.subject}
      accountId={detail.thread.accountId}
      dealId={detail.thread.dealId}
      contactId={detail.thread.contactId ?? null}
      to={meta.to}
      replyAll={meta.replyAll}
      threadDraft={activeDraft}
      quotedHtml={quotedHtml}
      forwardAttachments={forwardAttachments}
      mode={open.mode}
      ai={open.ai}
      expanded={open.expanded}
      onModeChange={(mode) =>
        // El panel IA se mantiene en Responder / A todos / Reenviar.
        setOpen((o) => (o ? { ...o, mode } : o))
      }
      onToggleAi={() =>
        setOpen((o) => (o ? { ...o, ai: !o.ai } : o))
      }
      onToggleExpand={() => setOpen((o) => (o ? { ...o, expanded: !o.expanded } : o))}
      onClose={() => {
        setOpen(null);
        setActiveDraft(null);
      }}
      onSent={onSent}
      onArchiveAfterSend={onArchiveAfterSend}
      shortcuts={shortcuts}
      onDraftDiscarded={() => {
        setOpen(null);
        setActiveDraft(null);
        onSent();
      }}
      onOpenAiStyle={onOpenAiStyle}
      onOpenSignature={onOpenSignature}
    />
  );
}
