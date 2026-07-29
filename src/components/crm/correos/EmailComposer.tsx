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

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Editor } from "@tiptap/react";
import { Check, Mic, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AttachmentPicker } from "@/components/opai-ds";
import { SimpleSelect } from "@/components/ui/simple-select";
import { confirmDialog } from "@/components/ui/confirm-service";
import { ContractEditor } from "@/components/docs/ContractEditor";
import { EmailToolbar } from "./EmailToolbar";
import { ScheduleSendSplitButton } from "./ScheduleSendSplitButton";
import { SignatureChip } from "./signature/SignatureChip";
import { tiptapToEmailHtml } from "@/lib/docs/tiptap-to-html";
import {
  ReplyRecipientsField,
  isValidEmail,
  normalizeRecipientList,
} from "./ReplyRecipientsField";
import { useEmailAttachments } from "./useEmailAttachments";
import {
  newEmailIdempotencyKey,
  notifyEmailQueued,
  notifyEmailQueuedOffline,
  sendCrmEmail,
} from "./email-send-client";
import { extractInlineImages } from "./email-inline-images";
import { composerSnapshot, docPlainText, isComposerPristine } from "./composer-draft";
import { discardGmailDraft } from "./correo-discard-draft";
import {
  ComposerCrmLink,
  type ComposerCrmLinkValue,
} from "./ComposerCrmLink";
import { ComposerModeSwitcher, type ComposerMode } from "./ComposerModeSwitcher";
import {
  isSpeechDictationSupported,
  useSpeechDictation,
} from "@/hooks/useSpeechDictation";
import { cn } from "@/lib/utils";

/** Anula el :focus-visible global que pinta rectángulos blancos en Asunto. */
const SUBJECT_INPUT_CLASS =
  "h-9 min-w-0 flex-1 appearance-none border-0 bg-transparent text-[16px] text-ds-text-1 shadow-none outline-none " +
  "placeholder:text-ds-text-4 sm:text-[13px] " +
  "focus:outline-none focus:ring-0 focus:ring-offset-0 " +
  "focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0";

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
  isDefault?: boolean;
};

/** API imperativa para el host (sheet): flush/discard al cerrar. */
export type EmailComposerHandle = {
  flushDraft: () => Promise<void>;
  discardDraft: () => Promise<void>;
};

type Props = {
  mode: EmailComposerMode;
  /**
   * `sheet`: fullscreen / ventana Gmail — cabecera y acciones fijas, solo el
   * cuerpo scrollea (evita caret + scrollbar moviéndose juntos en móvil).
   * `inline`: reply embebido en el lector (flujo previo).
   */
  layout?: "sheet" | "inline";
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
  /** Nombre de cuenta (solo UI del chip en mensaje nuevo). */
  accountName?: string | null;
  contactId?: string | null;
  /**
   * Fila CRM bajo Asunto (mensaje nuevo). Default: activo en `mode="new"`.
   * En reply/forward la asociación viene del hilo y no se edita aquí.
   */
  showCrmLink?: boolean;
  onSent?: () => void;
  onClose?: () => void;
  /** Tras descartar borrador con la papelera (refrescar cadena del hilo). */
  onDraftDiscarded?: () => void;
  /** Controles extra junto a Enviar (p.ej. toggle IA). */
  footerExtras?: React.ReactNode;
  /** Slot sobre adjuntos/Enviar (p.ej. pill "Help me write" estilo Gmail). */
  aboveFooter?: React.ReactNode;
  /** Abre preferencias de Correos en la pestaña Firma. */
  onOpenSignature?: () => void;
  /**
   * Selector Responder / A todos / Reenviar a la derecha de Para (estilo Gmail).
   * Solo el composer del lector lo usa; mensaje nuevo no lo pasa.
   */
  modeSwitcher?: {
    mode: ComposerMode;
    replyAllAvailable: boolean;
    onChange: (mode: ComposerMode) => void;
  } | null;
  /** Sello de contenido: al cambiar, el composer resetea con initialContent. */
  contentEpoch?: number;
  /** C22b: notifica al host si hay cambios sin enviar (confirmación de cierre). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Bloque 2: reportan cuerpo/asunto/draftId al host para preservarlos al
   *  cambiar de modo (Responder ↔ A todos ↔ Reenviar) sin perder trabajo. */
  onBodyChange?: (doc: object | null) => void;
  onSubjectChange?: (subject: string) => void;
  onToChange?: (to: string[]) => void;
  onDraftIdChange?: (id: string | null) => void;
  /** Casilla preferida al abrir composición nueva (no reply). */
  preferredAccountId?: string | null;
};

const AUTOSAVE_DEBOUNCE_MS = 3_000;

function isDocEmpty(doc: object | null): boolean {
  if (!doc) return true;
  const html = tiptapToEmailHtml(doc);
  return !html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

export const EmailComposer = forwardRef<EmailComposerHandle, Props>(function EmailComposer(
  {
    mode,
    layout = "inline",
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
    accountName = null,
    contactId = null,
    showCrmLink,
    onSent,
    onClose,
    onDraftDiscarded,
    footerExtras,
    aboveFooter,
    onOpenSignature,
    modeSwitcher = null,
    contentEpoch = 0,
    onDirtyChange,
    onBodyChange,
    onSubjectChange,
    onToChange,
    onDraftIdChange,
    preferredAccountId = null,
  },
  ref,
) {
  const isSheet = layout === "sheet";
  const crmLinkEnabled = showCrmLink ?? mode === "new";
  const attachments = useEmailAttachments();
  const [to, setTo] = useState<string[]>(() => normalizeRecipientList(initialTo));
  const [cc, setCc] = useState<string[]>(() => normalizeRecipientList(initialCc));
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCcBcc, setShowCcBcc] = useState(() => normalizeRecipientList(initialCc).length > 0);
  const [subject, setSubject] = useState(initialSubject);
  const [content, setContent] = useState<object | null>(initialContent);
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [identity, setIdentity] = useState<{ accountId: string; alias: string | null } | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [crmLink, setCrmLink] = useState<ComposerCrmLinkValue>(() => ({
    accountId: accountId ?? null,
    accountName: accountName ?? null,
    dealId: dealId ?? null,
  }));
  const effectiveAccountId = crmLinkEnabled ? crmLink.accountId : accountId;
  const effectiveDealId = crmLinkEnabled ? crmLink.dealId : dealId;

  const idempotencyKeyRef = useRef(newEmailIdempotencyKey());
  const providerDraftIdRef = useRef<string | null>(resumeDraftId);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const closedRef = useRef(false);
  const editorRef = useRef<Editor | null>(null);
  const insertedFinalRef = useRef("");
  const [dictValue, setDictValue] = useState("");
  const [dictSupported, setDictSupported] = useState(false);

  useEffect(() => {
    setDictSupported(isSpeechDictationSupported());
  }, []);

  const dictation = useSpeechDictation({
    value: dictValue,
    onChange: setDictValue,
    disabled: busy,
  });

  // Inserta en TipTap solo el texto final nuevo (el interim se muestra aparte).
  useEffect(() => {
    if (!dictation.listening) return;
    const finals = dictation.finalText;
    const prev = insertedFinalRef.current;
    if (finals.length <= prev.length) return;
    const added = finals.slice(prev.length);
    insertedFinalRef.current = finals;
    const editor = editorRef.current;
    if (!editor || !added.trim()) return;
    const needsSpace =
      Boolean(prev) && !prev.endsWith(" ") && !added.startsWith(" ");
    editor
      .chain()
      .focus()
      .insertContent(needsSpace ? ` ${added}` : added)
      .run();
  }, [dictation.finalText, dictation.listening]);

  useEffect(() => {
    if (dictation.error) toast.error(dictation.error);
  }, [dictation.error]);
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
          const preferred =
            preferredAccountId
              ? active.find((a) => a.id === preferredAccountId)
              : null;
          const picked =
            preferred ??
            active.find((a) => a.isDefault) ??
            active[0];
          const def = picked.aliases?.find((a) => a.isDefault);
          setIdentity({
            accountId: picked.id,
            alias: def && def.email !== picked.email.toLowerCase() ? def.email : null,
          });
        }
      })
      .catch(() => {});
  }, [isReply, preferredAccountId]);

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

  const discardDraft = useCallback(
    async (opts?: { close?: boolean }) => {
      closedRef.current = true;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      const draftId = providerDraftIdRef.current;
      let discarded = false;
      if (draftId) {
        discarded = await discardGmailDraft(draftId);
        providerDraftIdRef.current = null;
        onDraftIdChange?.(null);
        if (discarded) toast.message("Borrador descartado");
        else toast.error("No se pudo descartar el borrador");
      }
      dirtyRef.current = false;
      onDirtyChange?.(false);
      if (discarded) onDraftDiscarded?.();
      // Via ref el host (sheet) cierra; desde la papelera cerramos aquí.
      if (opts?.close !== false) onClose?.();
    },
    [onClose, onDirtyChange, onDraftIdChange, onDraftDiscarded],
  );

  const flushDraft = useCallback(async () => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    await saveDraft();
  }, [saveDraft]);

  useImperativeHandle(
    ref,
    () => ({
      flushDraft,
      discardDraft: () => discardDraft({ close: false }),
    }),
    [flushDraft, discardDraft],
  );

  async function requestDiscard() {
    if (isPristine() && !providerDraftIdRef.current) {
      onClose?.();
      return;
    }
    const ok = await confirmDialog({
      title: "¿Descartar borrador?",
      description: "Se elimina el borrador y no se puede deshacer.",
      confirmLabel: "Descartar",
      cancelLabel: "Cancelar",
      variant: "destructive",
    });
    if (ok) await discardDraft({ close: true });
  }

  const toNorm = normalizeRecipientList(to);
  const ccNorm = normalizeRecipientList(cc);
  const bccNorm = normalizeRecipientList(bcc);
  const allValid = [...to, ...cc, ...bcc].every(isValidEmail);
  const canSend =
    toNorm.length > 0 &&
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
        to: toNorm,
        cc: ccNorm,
        bcc: bccNorm,
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
        ...(effectiveDealId ? { dealId: effectiveDealId } : {}),
        ...(effectiveAccountId ? { accountId: effectiveAccountId } : {}),
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

  async function toggleDictation() {
    if (dictation.listening) {
      await dictation.finish();
      insertedFinalRef.current = "";
      setDictValue("");
      return;
    }
    insertedFinalRef.current = "";
    setDictValue("");
    dictation.start();
  }

  // En el lector (reply o forward de hilo) no mostramos "De": evita el salto
  // de altura al cambiar Responder ↔ Reenviar. Mensaje nuevo sí lo muestra.
  const showFromField =
    !isReply && !forwardFromThreadId && identityOptions.length > 1;

  const paraActions = (
    <>
      {modeSwitcher && (
        <ComposerModeSwitcher
          mode={modeSwitcher.mode}
          replyAllAvailable={modeSwitcher.replyAllAvailable}
          onChange={modeSwitcher.onChange}
          disabled={busy}
        />
      )}
      {!modeSwitcher &&
        replyAll &&
        (replyAll.cc.length > 0 ||
          replyAll.to.some((e) => !to.includes(e)) ||
          replyAll.to.length !== to.length) && (
          <button
            type="button"
            onClick={() => {
              setTo(replyAll.to);
              onToChange?.(replyAll.to);
              setCc(replyAll.cc);
              if (replyAll.cc.length > 0) setShowCcBcc(true);
            }}
            className="text-[12px] text-ds-text-3 hover:text-ds-text-1 ds-tap"
          >
            A todos
          </button>
        )}
      {!showCcBcc && (
        <button
          type="button"
          onClick={() => setShowCcBcc(true)}
          className="text-[12px] text-ds-text-3 hover:text-ds-text-1 ds-tap"
        >
          Cc/Cco
        </button>
      )}
    </>
  );

  const headerFields = (
    <>
      {showFromField && (
        <div className="flex items-center gap-2 border-b border-ds-border-subtle py-1 focus-within:border-ds-border-strong">
          <span className="w-10 shrink-0 text-[12px] text-ds-text-3">De</span>
          <SimpleSelect
            value={identity ? `${identity.accountId}:${identity.alias ?? ""}` : ""}
            onValueChange={(v) => {
              const option = identityOptions.find(
                (o) => `${o.accountId}:${o.alias ?? ""}` === v,
              );
              if (option) setIdentity({ accountId: option.accountId, alias: option.alias });
            }}
            className="h-10 min-w-0 flex-1 border-0 bg-transparent px-0 sm:h-9"
            aria-label="Casilla remitente"
            options={identityOptions.map((option) => ({
              value: `${option.accountId}:${option.alias ?? ""}`,
              label: option.label,
            }))}
          />
        </div>
      )}
      <ReplyRecipientsField
        label="Para"
        values={to}
        onChange={(next) => {
          setTo(next);
          onToChange?.(next);
        }}
        actions={paraActions}
      />
      {showCcBcc && (
        <>
          <ReplyRecipientsField label="CC" values={cc} onChange={setCc} />
          <ReplyRecipientsField label="CCO" values={bcc} onChange={setBcc} />
        </>
      )}
      <div className="flex items-center gap-2 border-b border-ds-border-subtle py-1 focus-within:border-ds-border-strong">
        <span className="w-10 shrink-0 text-[12px] text-ds-text-3">Asunto</span>
        <input
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            onSubjectChange?.(e.target.value);
          }}
          onKeyDown={(e) => {
            // No dejar que Enter/flechas filtren a atajos de bandeja.
            if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
              e.stopPropagation();
            }
          }}
          placeholder="Asunto"
          autoComplete="off"
          className={SUBJECT_INPUT_CLASS}
        />
      </div>
      {crmLinkEnabled && (
        <ComposerCrmLink
          value={crmLink}
          onChange={setCrmLink}
          disabled={busy}
        />
      )}
    </>
  );

  const editorBlock = (
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
      className={isSheet ? "min-h-0 flex-1" : "min-h-[200px]"}
      renderToolbar={(editor) => {
        editorRef.current = editor;
        return <EmailToolbar editor={editor} />;
      }}
    />
  );

  const footerBlock = (
    <>
      {aboveFooter}
      {dictation.listening && (dictation.interimText || dictation.silent) && (
        <p className="py-1 text-[12px] text-ds-text-3">
          {dictation.silent
            ? "Escuchando… (silencio detectado)"
            : (
              <>
                <span className="text-ds-text-4">Dictando: </span>
                <span className="text-ds-text-2">{dictation.interimText}</span>
              </>
            )}
        </p>
      )}
      {quotedHtml && (
        <p className="py-1.5 text-[12px] text-ds-text-3">
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
        className="rounded-none border-0 border-t border-ds-border-subtle bg-transparent px-0 py-2"
      />
      <div className="py-1">
        <SignatureChip onOpenFirma={onOpenSignature} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <ScheduleSendSplitButton
          busy={busy}
          disabled={!canSend}
          onSend={() => void send()}
          onSchedule={(date) => void send(date)}
        />
        {dictSupported && (
          <button
            type="button"
            title={dictation.listening ? "Detener dictado" : "Dictar por voz"}
            aria-label={dictation.listening ? "Detener dictado" : "Dictar por voz"}
            aria-pressed={dictation.listening}
            onClick={() => void toggleDictation()}
            disabled={busy}
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-full ds-tap sm:h-9 sm:w-9 disabled:opacity-50",
              dictation.listening
                ? "bg-status-danger-soft text-status-danger-fg"
                : "text-ds-text-2 hover:bg-ds-surface-2",
            )}
          >
            {dictation.listening ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
        {footerExtras}
        <button
          type="button"
          title="Descartar borrador"
          aria-label="Descartar borrador"
          onClick={() => void requestDiscard()}
          disabled={busy}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ds-text-3 ds-tap hover:bg-ds-surface-2 hover:text-status-danger-fg disabled:opacity-50 sm:h-9 sm:w-9"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        {draftSavedAt && (
          <span className="ml-auto inline-flex items-center gap-1 text-[12px] text-ds-text-4">
            <Check className="h-3.5 w-3.5" /> Borrador guardado {draftSavedAt}
          </span>
        )}
      </div>
    </>
  );

  if (isSheet) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col"
        data-email-composer
        data-layout="sheet"
      >
        <div className="shrink-0 space-y-0.5">{headerFields}</div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
          {editorBlock}
        </div>
        <div className="shrink-0 bg-background pt-1">{footerBlock}</div>
      </div>
    );
  }

  return (
    <div className="space-y-0" data-email-composer data-layout="inline">
      {headerFields}
      {editorBlock}
      {footerBlock}
    </div>
  );
});
