"use client";

import { useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/opai-ds";
import { CorreoActionBar } from "./CorreoActionBar";
import { CorreoComposerBox, type ComposerMode, type ReplyAll } from "./CorreoComposerBox";
import type { ForwardAttachmentRefClient } from "./EmailComposer";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";
import {
  DEFAULT_CORREO_SHORTCUTS,
  type CorreoShortcuts,
} from "./useCorreosViewPreferences";
import { normalizeRecipientList } from "./ReplyRecipientsField";
import type { ComposeIntent } from "./correo-reader-intent";

type Meta = { to: string[]; replyAll: ReplyAll | null; radarItemId: string | null; preDraft: string | null };

function normalizeReplyAll(ra: ReplyAll | null): ReplyAll | null {
  if (!ra) return null;
  return {
    to: normalizeRecipientList(ra.to ?? []),
    cc: normalizeRecipientList(ra.cc ?? []),
  };
}

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

/**
 * Orquesta la respuesta del lector (Bloque 2): barra de acciones Gmail (cerrado)
 * ⇄ composer con modos (abierto), en exclusividad total. Los atajos R/T/F/I
 * los dispara useCorreosKeyboard → composeIntent (también con el foco en el
 * iframe del cuerpo). Absorbe la lógica IA del antiguo SuggestedReplyPanel.
 *
 * La barra de acciones se muestra de inmediato (sin esperar suggest-reply): el
 * meta se hidrata en background para no bloquear la lectura con un spinner.
 */
export function CorreoReplyBox({
  detail,
  onSent,
  shortcuts = DEFAULT_CORREO_SHORTCUTS,
  composeIntent = null,
}: {
  detail: CorreoDetail;
  onSent: () => void;
  shortcuts?: CorreoShortcuts;
  /** Pedido externo (atajo desde bandeja / menú contextual). */
  composeIntent?: ComposeIntent | null;
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

  function openComposer(mode: ComposerMode, ai = false) {
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
        onReply={() => openComposer("reply", false)}
        onReplyAll={() => openComposer("all", false)}
        onForward={() => openComposer("forward", false)}
        onReplyAI={() => openComposer("reply", true)}
      />
    );
  }

  // Composer abierto antes de que llegue el meta: spinner mínimo en el box.
  if (!metaReady && open.mode !== "forward") {
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
      to={meta.to}
      replyAll={meta.replyAll}
      radarItemId={meta.radarItemId}
      preDraft={meta.preDraft}
      forwardQuotedHtml={buildForwardQuote(detail)}
      forwardAttachments={forwardAttachments}
      mode={open.mode}
      ai={open.ai}
      expanded={open.expanded}
      onModeChange={(mode) => setOpen((o) => (o ? { ...o, mode } : o))}
      onToggleAi={() => setOpen((o) => (o ? { ...o, ai: !o.ai } : o))}
      onToggleExpand={() => setOpen((o) => (o ? { ...o, expanded: !o.expanded } : o))}
      onClose={() => setOpen(null)}
      onSent={onSent}
    />
  );
}
