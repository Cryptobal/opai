"use client";

/**
 * SendEmailDialog — modal reusable para reenviar el PDF + XML de un DTE
 * con control granular sobre TO / CC / BCC.
 *
 * Antes el botón "Reenviar email" llamaba al endpoint con body vacío:
 * el email iba al receiverEmail por default sin posibilidad de copiar
 * a nadie ni de mandar oculto. Ahora el usuario puede:
 *   - Editar el TO (cambiar el destinatario al re-enviar).
 *   - Agregar CC (visible para el receptor).
 *   - Agregar BCC (oculto, ej: contador interno).
 *
 * Pre-llena con `receiverEmail` y `receiverEmailCc` del DTE para que el
 * caso típico (volver a enviar al mismo) sea un click.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Mail, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

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
   * Sugerencias de CC desde el CRM (contactos del receptor). Si no
   * se pasa, el usuario solo puede agregar emails manualmente.
   */
  suggestedCc?: { email: string; label?: string }[];
  /** Callback opcional al éxito. */
  onSent?: () => void;
}

/** Validador de email simple (mismo patrón que el resto del módulo). */
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
  onSent,
}: Props) {
  const [recipient, setRecipient] = useState<string>(defaultRecipient ?? "");
  const [cc, setCc] = useState<string[]>(defaultCc);
  const [bcc, setBcc] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState("");
  const [bccInput, setBccInput] = useState("");
  const [sending, setSending] = useState(false);

  // Reset cuando se abre/cierra el modal o cambia el DTE.
  useEffect(() => {
    if (!open) return;
    setRecipient(defaultRecipient ?? "");
    setCc(defaultCc);
    setBcc([]);
    setCcInput("");
    setBccInput("");
  }, [open, defaultRecipient, defaultCc]);

  const isRecipientValid = useMemo(
    () => recipient.trim() === "" || EMAIL_RE.test(recipient.trim()),
    [recipient],
  );

  const addChip = (
    list: string[],
    setter: (s: string[]) => void,
    raw: string,
    inputSetter: (s: string) => void,
  ) => {
    const trimmed = raw.trim().replace(/[,;]+$/, "");
    if (!trimmed) {
      inputSetter("");
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      toast.error(`Email inválido: ${trimmed}`);
      return;
    }
    if (list.includes(trimmed) || trimmed === recipient) {
      inputSetter("");
      return;
    }
    if (list.length >= 10) {
      toast.error("Máximo 10 emails por campo (CC o BCC).");
      return;
    }
    setter([...list, trimmed]);
    inputSetter("");
  };

  const removeChip = (
    list: string[],
    setter: (s: string[]) => void,
    email: string,
  ) => {
    setter(list.filter((e) => e !== email));
  };

  // Sugerencias filtradas: las que ya están en CC NO se muestran.
  const ccSuggestionsToShow = suggestedCc.filter(
    (s) => !cc.includes(s.email) && s.email !== recipient,
  );

  async function handleSend() {
    if (!recipient.trim()) {
      toast.error("Ingresa el email del destinatario (TO).");
      return;
    }
    if (!EMAIL_RE.test(recipient.trim())) {
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
      } = {};
      if (recipient.trim() !== (defaultRecipient ?? "")) {
        body.recipientEmail = recipient.trim();
      }
      if (cc.length > 0) body.ccOverride = cc;
      if (bcc.length > 0) body.bccOverride = bcc;

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
          {/* TO */}
          <div className="space-y-1.5">
            <Label htmlFor="email-to">Para (TO) *</Label>
            <Input
              id="email-to"
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="cliente@empresa.cl"
              className={`h-10 sm:h-9 ${
                !isRecipientValid && recipient.trim()
                  ? "border-status-danger-border"
                  : ""
              }`}
            />
            {!isRecipientValid && recipient.trim() && (
              <p className="text-[12px] text-status-danger-fg">
                Formato de email inválido.
              </p>
            )}
            {!recipient.trim() && (
              <p className="text-[12px] text-muted-foreground">
                El receptor no tiene email guardado. Ingresá uno acá.
              </p>
            )}
          </div>

          {/* CC */}
          <div className="space-y-1.5">
            <Label htmlFor="email-cc">
              CC <span className="text-[12px] text-muted-foreground font-normal">(visibles para el receptor)</span>
            </Label>
            <ChipList list={cc} onRemove={(e) => removeChip(cc, setCc, e)} />
            <div className="flex gap-2">
              <Input
                id="email-cc"
                type="email"
                value={ccInput}
                onChange={(e) => setCcInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addChip(cc, setCc, ccInput, setCcInput);
                  }
                }}
                placeholder="contador@empresa.cl, gerencia@empresa.cl…"
                className="h-10 sm:h-9 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addChip(cc, setCc, ccInput, setCcInput)}
                disabled={!ccInput.trim()}
                className="h-10 sm:h-9 shrink-0"
              >
                <Plus className="h-4 w-4 mr-1" />
                Agregar
              </Button>
            </div>
            {ccSuggestionsToShow.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[12px] text-muted-foreground self-center">
                  Sugerencias del CRM:
                </span>
                {ccSuggestionsToShow.map((s) => (
                  <button
                    key={s.email}
                    type="button"
                    onClick={() => {
                      if (!cc.includes(s.email)) setCc([...cc, s.email]);
                    }}
                    className="text-[12px] px-2 py-0.5 rounded-md border border-dashed border-ds-border-default hover:bg-status-info-soft hover:border-status-info-border hover:text-status-info-fg transition-colors"
                    title={`Agregar ${s.email}`}
                  >
                    + {s.label ?? s.email}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* BCC */}
          <div className="space-y-1.5">
            <Label htmlFor="email-bcc">
              BCC{" "}
              <span className="text-[12px] text-muted-foreground font-normal">
                (ocultos — el receptor NO los ve)
              </span>
            </Label>
            <ChipList
              list={bcc}
              onRemove={(e) => removeChip(bcc, setBcc, e)}
              variant="bcc"
            />
            <div className="flex gap-2">
              <Input
                id="email-bcc"
                type="email"
                value={bccInput}
                onChange={(e) => setBccInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addChip(bcc, setBcc, bccInput, setBccInput);
                  }
                }}
                placeholder="contabilidad-interna@miempresa.cl…"
                className="h-10 sm:h-9 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addChip(bcc, setBcc, bccInput, setBccInput)}
                disabled={!bccInput.trim()}
                className="h-10 sm:h-9 shrink-0"
              >
                <Plus className="h-4 w-4 mr-1" />
                Agregar
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-ds-border-subtle bg-ds-surface-2 p-3 text-[12px] text-ds-text-3">
            <p>
              Adjuntos: <strong className="text-ds-text-2">PDF + XML</strong>{" "}
              del DTE. El subject usa el template del tenant configurado en
              <code className="mx-1">/opai/configuracion/finanzas/dte</code>.
            </p>
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
          <Button onClick={handleSend} disabled={sending || !recipient.trim()}>
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

function ChipList({
  list,
  onRemove,
  variant,
}: {
  list: string[];
  onRemove: (email: string) => void;
  variant?: "bcc";
}) {
  if (list.length === 0) return null;
  const baseClass =
    variant === "bcc"
      ? "inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-md bg-ds-surface-3 text-ds-text-2 border border-ds-border-subtle"
      : "inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-md bg-status-info-soft text-status-info-fg border border-status-info-border";
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((email) => (
        <span key={email} className={baseClass}>
          {email}
          <button
            type="button"
            onClick={() => onRemove(email)}
            className="hover:opacity-70"
            aria-label={`Quitar ${email}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
