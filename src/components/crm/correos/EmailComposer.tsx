"use client";

/**
 * Composer unificado de correo (C13/C08/P06, PR-10): un solo componente
 * Tiptap (infraestructura doc-templates + tokens) para nuevo / responder /
 * responder-a-todos / reenviar.
 *
 *  - Autosave a Gmail Drafts (debounce ~3 s): cerrar nunca pierde trabajo y
 *    el borrador aparece en Gmail (y viceversa vía sync).
 *  - Identidad: casilla + aliases sendAs (PR-04/C08); fija en replies.
 *  - Envío por outbox: idempotencyKey por intento, deshacer 15 s y
 *    programar envío con presets.
 *  - Imágenes pegadas/soltadas viajan inline (CID). Adjuntos staged a R2.
 *  - Forward re-adjunta los originales desde Gmail (server-side).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Check, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AttachmentPicker, Spinner } from "@/components/opai-ds";
import { ContractEditor } from "@/components/docs/ContractEditor";
import { EmailToolbar } from "./EmailToolbar";
import { tiptapToEmailHtml } from "@/lib/docs/tiptap-to-html";
import { ReplyRecipientsField, isValidEmail } from "./ReplyRecipientsField";
import { useEmailAttachments } from "./useEmailAttachments";
import {
  newEmailIdempotencyKey,
  notifyEmailQueued,
  notifyEmailQueuedOffline,
  scheduleSendPresets,
  sendCrmEmail,
} from "./email-send-client";
import { extractInlineImages } from "./email-inline-images";
import { composerSnapshot, docPlainText, isComposerPristine } from "./composer-draft";

export type EmailComposerMode = "new" | "reply" | "forward";

export type ForwardAttachmentRefClient = {
  providerMessageId: string;
  attachmentId: string;
  fileName: string;
  size: number | null;
};

type AccountAlias = {
  email: string;
  displayName: string | null;
  isDefault: boolean;
};

type AccountOption = {
  id: string;
  email: string;
  aliases: AccountAlias[];
};

type Props = {
  mode: EmailComposerMode;
  /** Hilo interno al que se responde (threading + casilla fija). */
  threadId?: string | null;
  initialTo?: string[];
  initialCc?: string[];
  initialSubject?: string;
  /** Destinatarios de "Responder a todos" (muestra el botón si difieren). */
  replyAll?: { to: string[]; cc: string[] } | null;
  /** Contenido inicial del editor (doc Tiptap), p.ej. borrador IA. */
  initialContent?: object | null;
  /** Forward: HTML del mensaje original, citado al final del envío. */
  quotedHtml?: string | null;
  forwardFromThreadId?: string | null;
  forwardAttachments?: ForwardAttachmentRefClient[];
  /** Draft existente a retomar (providerDraftId de Gmail). */
  resumeDraftId?: string | null;
  /** Asociaciones CRM a propagar al hilo del envío. */
  dealId?: string | null;
  accountId?: string | null;
  contactId?: string | null;
  onSent?: () => void;
  onClose?: () => void;
  /** Controles extra junto a Enviar (p.ej. IA de respuesta sugerida). */
  footerExtras?: React.ReactNode;
  /** Sello de contenido: al cambiar, el composer resetea con initialContent. */
  contentEpoch?: number;
  /** C22b: notifica al host si hay cambios sin enviar (confirmación de cierre). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Bloque 2: reportan cuerpo/asunto/draftId al host para preservarlos al
   *  cambiar de modo (Responder ↔ A todos ↔ Reenviar) sin perder trabajo. */
  onBodyChange?: (doc: object | null) => void;
  onSubjectChange?: (subject: string) => void;
  onDraftIdChange?: (id: string | null) => void;
};

const AUTOSAVE_DEBOUNCE_MS = 3_000;

function isDocEmpty(doc: object | null): boolean {
  if (!doc) return true;
  const html = tiptapToEmailHtml(doc);
  return !html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

export function EmailComposer({
  mode,
  threadId = null,
  initialTo = [],
  initialCc = [],
  initialSubject = "",
  replyAll = null,
  initialContent = null,
  quotedHtml = null,
  forwardFromThreadId = null,
  forwardAttachments = [],
  resumeDraftId = null,
  dealId = null,
  accountId = null,
  contactId = null,
  onSent,
  onClose,
  footerExtras,
  contentEpoch = 0,
  onDirtyChange,
  onBodyChange,
  onSubjectChange,
  onDraftIdChange,
}: Props) {
  const attachments = useEmailAttachments();
  const [to, setTo] = useState<string[]>(initialTo);
  const [cc, setCc] = useState<string[]>(initialCc);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCcBcc, setShowCcBcc] = useState(initialCc.length > 0);
  const [subject, setSubject] = useState(initialSubject);
  const [content, setContent] = useState<object | null>(initialContent);
  const [busy, setBusy] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [customSchedule, setCustomSchedule] = useState("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [identity, setIdentity] = useState<{ accountId: string; alias: string | null } | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  const idempotencyKeyRef = useRef(newEmailIdempotencyKey());
  const providerDraftIdRef = useRef<string | null>(resumeDraftId);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const closedRef = useRef(false);
  // Estado inicial del composer: un reply/forward llega con destinatarios y
  // asunto prefijados (y a veces un borrador IA). Abrir/leer un correo NO debe
  // crear un borrador en Gmail — solo autoguardamos cuando el usuario editó
  // algo respecto de este baseline.
  const baselineRef = useRef(
    composerSnapshot({
      to: initialTo,
      cc: initialCc,
      bcc: [],
      subject: initialSubject,
      body: initialContent,
    }),
  );

  // Borrador IA u otro contenido inyectado después del mount: se convierte en
  // el nuevo baseline (inyectar una sugerencia no cuenta como edición del
  // usuario; recién al tocarla se guarda).
  useEffect(() => {
    if (contentEpoch > 0 && initialContent) {
      setContent(initialContent);
      baselineRef.current.body = docPlainText(initialContent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentEpoch]);

  const isReply = mode === "reply";

  /** Sin cambios del usuario respecto del estado inicial → no hay borrador que
   *  guardar (evita basura en Gmail por el solo hecho de abrir un correo). */
  const isPristine = useCallback(
    () => isComposerPristine({ to, cc, bcc, subject, body: content }, baselineRef.current),
    [to, cc, bcc, subject, content],
  );

  // Identidad: casillas + aliases (solo composición nueva/forward; el reply
  // usa la casilla dueña del hilo, resuelta server-side).
  useEffect(() => {
    if (isReply) return;
    fetch("/api/crm/gmail/accounts?aliases=1")
      .then((r) => r.json())
      .then((d) => {
        const active = ((d.accounts ?? []) as Array<AccountOption & { status?: string }>)
          .filter((a) => !a.status || a.status === "active");
        setAccounts(active);
        if (active.length > 0) {
          const first = active[0];
          const def = first.aliases?.find((a) => a.isDefault);
          setIdentity({
            accountId: first.id,
            alias: def && def.email !== first.email.toLowerCase() ? def.email : null,
          });
        }
      })
      .catch(() => {});
  }, [isReply]);

  const identityOptions = useMemo(() => {
    const options: Array<{ key: string; label: string; accountId: string; alias: string | null }> = [];
    for (const account of accounts) {
      const aliases = account.aliases?.length
        ? account.aliases
        : [{ email: account.email.toLowerCase(), displayName: null, isDefault: true }];
      for (const alias of aliases) {
        const isPrimary = alias.email === account.email.toLowerCase();
        options.push({
          key: `${account.id}:${alias.email}`,
          label: alias.displayName ? `${alias.displayName} <${alias.email}>` : alias.email,
          accountId: account.id,
          alias: isPrimary ? null : alias.email,
        });
      }
    }
    return options;
  }, [accounts]);

  const currentHtml = useCallback(
    () => (content ? tiptapToEmailHtml(content) : ""),
    [content],
  );

  // ── Autosave a Gmail Drafts (C08) ──
  const saveDraft = useCallback(async () => {
    if (savingRef.current || closedRef.current) return;
    // Sin edición real (reply/forward recién abierto, borrador IA sin tocar,
    // composición vacía) no se crea ni actualiza nada en Gmail.
    if (isPristine()) return;
    const html = content ? tiptapToEmailHtml(content) : "";
    savingRef.current = true;
    try {
      const res = await fetch("/api/crm/gmail/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerDraftId: providerDraftIdRef.current,
          to,
          cc,
          bcc,
          subject,
          html,
          threadId,
          emailAccountId: identity?.accountId ?? null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { providerDraftId?: string };
      };
      if (res.ok && data.success && data.data?.providerDraftId) {
        providerDraftIdRef.current = data.data.providerDraftId;
        onDraftIdChange?.(data.data.providerDraftId);
        dirtyRef.current = false;
        setDraftSavedAt(
          new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
        );
      }
    } catch {
      /* autosave silencioso: el próximo tick reintenta */
    } finally {
      savingRef.current = false;
    }
  }, [content, subject, to, cc, bcc, threadId, identity, isPristine]);

  useEffect(() => {
    const pristine = isPristine();
    dirtyRef.current = !pristine;
    onDirtyChange?.(!pristine);
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    // Sin cambios respecto del estado inicial no se programa autosave: abrir un
    // correo (que monta el composer de respuesta) ya no genera un borrador.
    if (!pristine) {
      autosaveTimerRef.current = setTimeout(() => void saveDraft(), AUTOSAVE_DEBOUNCE_MS);
    }
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveDraft]);

  // Flush al desmontar: cerrar el composer nunca pierde trabajo.
  useEffect(
    () => () => {
      if (dirtyRef.current && !closedRef.current) void saveDraft();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function discardDraft() {
    closedRef.current = true;
    const draftId = providerDraftIdRef.current;
    if (draftId) {
      await fetch(`/api/crm/gmail/drafts/${draftId}`, { method: "DELETE" }).catch(() => {});
      toast.message("Borrador descartado");
    }
    onClose?.();
  }

  const allValid = [...to, ...cc, ...bcc].every(isValidEmail);
  const canSend =
    to.length > 0 &&
    allValid &&
    subject.trim().length > 0 &&
    (!isDocEmpty(content) || Boolean(quotedHtml)) &&
    !attachments.uploading &&
    !attachments.hasErrors;

  async function send(scheduledAt?: Date) {
    if (!canSend || busy) return;
    setBusy(true);
    try {
      let html = currentHtml();
      if (quotedHtml) {
        html += `<br><div class="gmail_quote">--------- Mensaje reenviado ---------<br>${quotedHtml}</div>`;
      }
      const { html: finalHtml, inlineImages } = await extractInlineImages(html);
      const result = await sendCrmEmail({
        to,
        cc,
        bcc,
        subject: subject.trim(),
        html: finalHtml,
        attachments: attachments.readyAttachments,
        inlineImages,
        idempotencyKey: idempotencyKeyRef.current,
        providerDraftId: providerDraftIdRef.current,
        ...(isReply && threadId
          ? { threadId }
          : identity
            ? { emailAccountId: identity.accountId, fromAlias: identity.alias }
            : {}),
        ...(mode === "forward" && forwardFromThreadId
          ? { forwardFromThreadId, forwardAttachments }
          : {}),
        ...(dealId ? { dealId } : {}),
        ...(accountId ? { accountId } : {}),
        ...(contactId ? { contactId } : {}),
        ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}),
      });
      if (!result.ok) {
        toast.error(result.error || "No se pudo enviar el correo");
        return;
      }
      closedRef.current = true;
      if (result.queued) {
        if (result.offline) notifyEmailQueuedOffline();
        else notifyEmailQueued(result.data);
      } else if (result.warning) {
        toast.message(result.warning);
      } else {
        toast.success("Correo enviado por Gmail");
      }
      idempotencyKeyRef.current = newEmailIdempotencyKey();
      providerDraftIdRef.current = null;
      attachments.resetAfterSend();
      onSent?.();
      onClose?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo enviar el correo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {!isReply && identityOptions.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-[12px] text-ds-text-3">De</span>
          <select
            value={identity ? `${identity.accountId}:${identity.alias ?? ""}` : ""}
            onChange={(e) => {
              const option = identityOptions.find(
                (o) => `${o.accountId}:${o.alias ?? ""}` === e.target.value,
              );
              if (option) setIdentity({ accountId: option.accountId, alias: option.alias });
            }}
            className="h-9 min-w-0 flex-1 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1"
            aria-label="Casilla remitente"
          >
            {identityOptions.map((option) => (
              <option key={option.key} value={`${option.accountId}:${option.alias ?? ""}`}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <ReplyRecipientsField label="Para" values={to} onChange={setTo} />
      <div className="flex items-center gap-3">
        {replyAll &&
          (replyAll.cc.length > 0 ||
            replyAll.to.some((e) => !to.includes(e)) ||
            replyAll.to.length !== to.length) && (
            <button
              type="button"
              onClick={() => {
                setTo(replyAll.to);
                setCc(replyAll.cc);
                if (replyAll.cc.length > 0) setShowCcBcc(true);
              }}
              className="text-[12px] text-ds-text-2 underline underline-offset-2 ds-tap"
            >
              Responder a todos
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
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            onSubjectChange?.(e.target.value);
          }}
          placeholder="Asunto"
          className="h-9 min-w-0 flex-1 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1"
        />
      </div>
      <div className="overflow-hidden rounded-lg border border-ds-border-default bg-ds-surface-1">
        <ContractEditor
          content={content ?? undefined}
          onChange={(next) => {
            setContent(next);
            onBodyChange?.(next);
          }}
          editable={!busy}
          placeholder="Escribí tu mensaje… (pegá imágenes directo)"
          showPagePreview={false}
          enableImages
          enableTokens={false}
          compact
          renderToolbar={(editor) => <EmailToolbar editor={editor} />}
        />
      </div>
      {quotedHtml && (
        <p className="text-[12px] text-ds-text-3">
          Se incluirá el mensaje original citado al final{forwardAttachments.length > 0
            ? ` · ${forwardAttachments.length} adjunto(s) original(es) se re-adjuntan`
            : ""}.
        </p>
      )}
      <AttachmentPicker
        items={attachments.items}
        onFiles={attachments.addFiles}
        onRemove={attachments.remove}
        onRetry={attachments.retry}
        disabled={busy}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || !canSend}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground ds-tap disabled:opacity-50"
        >
          {busy ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          {busy ? "Enviando…" : "Enviar"}
        </button>
        <button
          type="button"
          title="Programar envío"
          aria-label="Programar envío"
          onClick={() => setScheduleOpen((v) => !v)}
          disabled={busy || !canSend}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-ds-border-default px-2.5 ds-tap disabled:opacity-50"
        >
          <CalendarClock className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Descartar borrador"
          aria-label="Descartar borrador"
          onClick={() => void discardDraft()}
          disabled={busy}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-ds-border-default px-2.5 text-status-danger-fg ds-tap disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        {footerExtras}
        {draftSavedAt && (
          <span className="ml-auto inline-flex items-center gap-1 text-[12px] text-ds-text-4">
            <Check className="h-3.5 w-3.5" /> Borrador guardado {draftSavedAt}
          </span>
        )}
      </div>
      {scheduleOpen && (
        <div className="space-y-2 rounded-lg border border-ds-border-subtle bg-ds-surface-1 p-2">
          <p className="text-[12px] text-ds-text-3">Programar envío</p>
          <div className="flex flex-wrap items-center gap-2">
            {scheduleSendPresets().map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => void send(preset.date)}
                className="h-9 rounded-full bg-ds-surface-2 px-3 text-[12px] text-ds-text-2 ds-tap"
              >
                {preset.label}
              </button>
            ))}
            <input
              type="datetime-local"
              value={customSchedule}
              onChange={(e) => setCustomSchedule(e.target.value)}
              className="h-9 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[12px] text-ds-text-1"
              aria-label="Fecha y hora personalizada"
            />
            <button
              type="button"
              disabled={!customSchedule}
              onClick={() => {
                const date = new Date(customSchedule);
                if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() + 2 * 60_000) {
                  toast.error("Elegí una fecha futura (mínimo 2 minutos)");
                  return;
                }
                void send(date);
              }}
              className="h-9 rounded-lg border border-ds-border-default px-3 text-[12px] ds-tap disabled:opacity-50"
            >
              Programar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
