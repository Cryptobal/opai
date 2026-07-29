"use client";

import { useEffect, useMemo, useState } from "react";
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

type Meta = { to: string[]; replyAll: ReplyAll | null; radarItemId: string | null; preDraft: string | null };

function normalizeReplyAll(ra: ReplyAll | null): ReplyAll | null {
  if (!ra) return null;
  return {
    to: normalizeRecipientList(ra.to ?? []),
    cc: normalizeRecipientList(ra.cc ?? []),
  };
}

/** HTML citado del último mensaje del hilo para reenviar (C13). */
function buildForwardQuote(detail: ReplyBoxDetail): string {
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

function scrollComposerIntoView() {
  const run = () => {
    const el = document.getElementById("correo-suggested-reply");
    if (!el) return;
    // El scroller real es el panel del lector (overflow-y-auto), no la ventana.
    const scroller = el.closest(".overflow-y-auto");
    if (scroller instanceof HTMLElement) {
      const elRect = el.getBoundingClientRect();
      const scRect = scroller.getBoundingClientRect();
      const nextTop = scroller.scrollTop + (elRect.bottom - scRect.bottom) + 24;
      scroller.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "end" });
  };
  // Esperar al paint del composer (setState → mount) antes de scrollear.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(run);
  });
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
 * no un tab exclusivo. Atajos R/A/F → composeIntent (también con foco en el
 * iframe del cuerpo).
 *
 * La barra de acciones se muestra de inmediato (sin esperar suggest-reply): el
 * meta se hidrata en background para no bloquear la lectura con un spinner.
 *
 * Si el hilo tiene un borrador, Responder/Continuar lo reanuda (mismo
 * providerDraftId) en vez de crear otro.
 */
export function CorreoReplyBox({
  detail,
  onSent,
  shortcuts = DEFAULT_CORREO_SHORTCUTS,
  composeIntent = null,
  continueDraftIntent = null,
  onOpenAiStyle,
}: {
  detail: ReplyBoxDetail;
  onSent: () => void;
  shortcuts?: CorreoShortcuts;
  /** Pedido externo (atajo desde bandeja / menú contextual). */
  composeIntent?: ComposeIntent | null;
  /** Continuar un borrador desde la card de la cadena. */
  continueDraftIntent?: { message: CorreoMessageDTO; nonce: number } | null;
  onOpenAiStyle?: () => void;
}) {
  const threadId = detail.thread.id;
  const [meta, setMeta] = useState<Meta>({
    to: [],
    replyAll: null,
    radarItemId: null,
    preDraft: null,
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
          radarItemId: d.radarItemId ?? null,
          preDraft: d.draft ? String(d.draft) : null,
        });
      })
      .catch(() => {
        if (alive) setMeta({ to: [], replyAll: null, radarItemId: null, preDraft: null });
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

  const canReply = meta.to.length > 0 || Boolean(meta.replyAll);
  const replyAllAvailable = useMemo(() => {
    const ra = meta.replyAll;
    const to = meta.to;
    return Boolean(ra && (ra.cc.length > 0 || ra.to.some((e) => !to.includes(e)) || ra.to.length !== to.length));
  }, [meta]);

  const forwardAttachments: ForwardAttachmentRefClient[] = detail.attachments.map((a) => ({
    providerMessageId: a.messageId,
    attachmentId: a.attachmentId,
    fileName: a.filename,
    size: a.size,
  }));

  if (!open) {
    return (
      <CorreoActionBar
        canReply={metaReady ? canReply : true}
        replyAllAvailable={metaReady ? replyAllAvailable : false}
        shortcuts={shortcuts}
        onReply={() => openComposer("reply", true)}
        onReplyAll={() => openComposer("all", true)}
        onForward={() => openComposer("forward", false)}
      />
    );
  }

  // Composer abierto antes de que llegue el meta: spinner mínimo en el box.
  // Si reanudamos un borrador ya tenemos destinatarios/cuerpo — no bloquear.
  if (!metaReady && open.mode !== "forward" && !activeDraft) {
    return (
      <div id="correo-suggested-reply" className="flex justify-center py-4">
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
      radarItemId={meta.radarItemId}
      preDraft={meta.preDraft}
      threadDraft={activeDraft}
      forwardQuotedHtml={buildForwardQuote(detail)}
      forwardAttachments={forwardAttachments}
      mode={open.mode}
      ai={open.ai}
      expanded={open.expanded}
      onModeChange={(mode) =>
        // Responder ↔ A todos mantienen el panel IA; Reenviar lo cierra
        // (el asistente no aplica al forward).
        setOpen((o) => (o ? { ...o, mode, ai: mode === "forward" ? false : o.ai } : o))
      }
      onToggleAi={() =>
        setOpen((o) => {
          if (!o) return o;
          if (o.ai) return { ...o, ai: false };
          return {
            ...o,
            ai: true,
            mode: o.mode === "forward" ? "reply" : o.mode,
          };
        })
      }
      onToggleExpand={() => setOpen((o) => (o ? { ...o, expanded: !o.expanded } : o))}
      onClose={() => {
        setOpen(null);
        setActiveDraft(null);
      }}
      onSent={onSent}
      onDraftDiscarded={() => {
        setOpen(null);
        setActiveDraft(null);
        onSent();
      }}
      onOpenAiStyle={onOpenAiStyle}
    />
  );
}
