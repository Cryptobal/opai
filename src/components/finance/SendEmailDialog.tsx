"use client";

/**
 * SendEmailDialog — modal reusable para reenviar el PDF + XML de un DTE
 * con control granular sobre TO / CC / BCC + selección de adjuntos
 * USER_UPLOAD.
 *
 * Antes el botón "Reenviar email" llamaba al endpoint con body vacío:
 * el email iba al receiverEmail por default sin posibilidad de copiar
 * a nadie ni de mandar oculto. Ahora el usuario puede editar TO/CC/BCC.
 *
 * La parte TO/CC/BCC fue extraída a `DteRecipientsPicker` para
 * reutilizarse en los formularios de emisión (factura/NC/ND); este
 * dialog solo se queda con adjuntos + el endpoint /send-email.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Mail,
  Paperclip,
  FileText,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  DteRecipientsPicker,
  type DteRecipientsValue,
} from "./DteRecipientsPicker";

type UserAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function attachIcon(mime: string) {
  if (mime.startsWith("image/"))
    return <ImageIcon className="h-3.5 w-3.5 text-blue-500" />;
  if (mime === "application/pdf")
    return <FileText className="h-3.5 w-3.5 text-red-500" />;
  return <Paperclip className="h-3.5 w-3.5 text-gray-500" />;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dteId: string;
  /** Folio para mostrar en el header del modal. */
  folio: number;
  /** Tipo DTE (33/34/etc.) para etiqueta. */
  dteType: number;
  /** Email primario actual del DTE (pre-llena el TO). */
  defaultRecipient: string | null;
  /** CC adicionales guardados en el DTE (pre-llena CC chips). */
  defaultCc: string[];
  /**
   * Sugerencias de CC pre-computadas (opcional). Si se pasa
   * `crmAccountId`, el picker también las trae automáticamente desde
   * /api/crm/contacts?accountId=…
   */
  suggestedCc?: { email: string; label?: string }[];
  /**
   * Cuenta CRM dueña del DTE. Si está presente, el picker hace fetch
   * de los contactos asociados y los muestra como chips clickeables.
   */
  crmAccountId?: string | null;
  /**
   * RUT del receptor — fallback cuando crmAccountId está vacío (DTEs
   * viejos sin auto-link).
   */
  receiverRut?: string | null;
  /** Callback opcional al éxito. */
  onSent?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SendEmailDialog({
  open,
  onOpenChange,
  dteId,
  folio,
  dteType,
  defaultRecipient,
  defaultCc,
  suggestedCc = [],
  crmAccountId,
  receiverRut,
  onSent,
}: Props) {
  const [recipients, setRecipients] = useState<DteRecipientsValue>({
    to: defaultRecipient ?? "",
    cc: defaultCc,
    bcc: [],
  });
  const [sending, setSending] = useState(false);
  // Adjuntos del usuario (USER_UPLOAD) asociados al DTE. Por defecto se
  // incluyen TODOS en el correo; el usuario puede excluir alguno destildando.
  const [attachments, setAttachments] = useState<UserAttachment[]>([]);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [loadingAttachments, setLoadingAttachments] = useState(false);

  // Reset cuando se abre/cierra el modal o cambia el DTE.
  useEffect(() => {
    if (!open) return;
    setRecipients({
      to: defaultRecipient ?? "",
      cc: defaultCc,
      bcc: [],
    });
    setExcludedIds(new Set());
  }, [open, defaultRecipient, defaultCc, dteId]);

  // Cargar attachments cuando se abre.
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setLoadingAttachments(true);
    fetch(`/api/finance/billing/dtes/${dteId}/attachments`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setAttachments(j.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingAttachments(false));
    return () => ctrl.abort();
  }, [open, dteId]);

  const toggleExclude = (id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isRecipientValid = useMemo(
    () =>
      recipients.to.trim() === "" || EMAIL_RE.test(recipients.to.trim()),
    [recipients.to],
  );

  async function handleSend() {
    if (!recipients.to.trim()) {
      toast.error("Ingresa el email del destinatario (TO).");
      return;
    }
    if (!isRecipientValid) {
      toast.error("El email TO no tiene formato válido.");
      return;
    }
    setSending(true);
    try {
      // Si el TO coincide con el receiverEmail del DTE, NO mandamos
      // recipientEmail en el body para que el server use kind="manual_resend"
      // (vs "manual_override_recipient"). Eso le cambia la etiqueta en el
      // timeline, lo que hace más fácil distinguirlos.
      const body: {
        recipientEmail?: string;
        ccOverride?: string[];
        bccOverride?: string[];
        excludeAttachmentIds?: string[];
      } = {};
      if (recipients.to.trim() !== (defaultRecipient ?? "")) {
        body.recipientEmail = recipients.to.trim();
      }
      if (recipients.cc.length > 0) body.ccOverride = recipients.cc;
      if (recipients.bcc.length > 0) body.bccOverride = recipients.bcc;
      if (excludedIds.size > 0)
        body.excludeAttachmentIds = Array.from(excludedIds);

      const res = await fetch(
        `/api/finance/billing/issued/${dteId}/send-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Error al enviar email");
      }
      toast.success("Email enviado");
      onOpenChange(false);
      if (onSent) onSent();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Enviar DTE por email
          </DialogTitle>
          <DialogDescription>
            DTE tipo {dteType} folio {folio}. Se envía con PDF + XML adjuntos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <DteRecipientsPicker
            value={recipients}
            onChange={setRecipients}
            crmAccountId={crmAccountId}
            receiverRut={receiverRut}
            suggestedContacts={suggestedCc}
            disabled={sending}
          />

          <div className="rounded-md border border-ds-border-subtle bg-ds-surface-2 p-3 text-[12px] text-ds-text-3 space-y-2">
            <p>
              Adjuntos: <strong className="text-ds-text-2">PDF + XML</strong>{" "}
              del DTE. El subject usa el template del tenant configurado en
              <code className="mx-1">/opai/configuracion/finanzas/dte</code>.
            </p>
            {loadingAttachments ? (
              <p className="flex items-center gap-1.5 text-ds-text-3">
                <Loader2 className="h-3 w-3 animate-spin" /> Cargando archivos
                adjuntos…
              </p>
            ) : attachments.length > 0 ? (
              <div className="space-y-1">
                <p className="text-ds-text-2 font-medium">
                  Archivos adjuntos del DTE ({attachments.length}):
                </p>
                <ul className="space-y-0.5">
                  {attachments.map((a) => {
                    const included = !excludedIds.has(a.id);
                    return (
                      <li key={a.id}>
                        <label className="flex items-center gap-2 cursor-pointer hover:bg-ds-surface-3 rounded px-1 py-0.5">
                          <input
                            type="checkbox"
                            checked={included}
                            onChange={() => toggleExclude(a.id)}
                            className="rounded border-border"
                          />
                          {attachIcon(a.mimeType)}
                          <span
                            className={`flex-1 truncate ${included ? "text-ds-text-2" : "text-ds-text-3 line-through"}`}
                          >
                            {a.filename}
                          </span>
                          <span className="text-ds-text-3 shrink-0">
                            {fmtBytes(a.size)}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-ds-text-3 italic">
                  Destilda los que no quieras enviar en este correo.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !recipients.to.trim()}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Mail className="h-4 w-4 mr-1.5" />
            )}
            Enviar email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
