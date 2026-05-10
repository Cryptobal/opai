"use client";

/**
 * BillingDocSendModal
 *
 * Modal para enviar Proforma o Estado de Pago al cliente. Permite editar
 * destinatario, CC, BCC, asunto, mensaje y firmantes antes del envío.
 * Llama a:
 *   POST /api/finance/billing/drafts/[id]/send-as       (variant=PROFORMA o ESTADO_DE_PAGO)
 *   POST /api/finance/billing/issued/[id]/send-as       (variant=ESTADO_DE_PAGO)
 *
 * El parent decide qué endpoint usar (drafts vs. issued) según el
 * estado del DTE.
 */

import { useEffect, useState } from "react";
import { Loader2, Send, Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export type BillingDocVariant = "PROFORMA" | "ESTADO_DE_PAGO";
export type BillingDocTarget = "draft" | "issued";

interface SignerOption {
  id: string;
  name: string;
  role: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** ID del FinanceDte. */
  dteId: string;
  /** Es draft o ya emitido (cambia el endpoint). */
  target: BillingDocTarget;
  /** Default variant a enviar. El usuario puede cambiarla solo si target=draft. */
  defaultVariant: BillingDocVariant;
  /** Email primario sugerido (contacto Estado de Pago o receptor). */
  defaultRecipientEmail: string | null;
  /** Nombre del receptor para el preview/heading. */
  receiverName: string;
  /** Callback cuando el envío se completa con éxito. */
  onSent?: () => void;
}

export function BillingDocSendModal({
  open,
  onOpenChange,
  dteId,
  target,
  defaultVariant,
  defaultRecipientEmail,
  receiverName,
  onSent,
}: Props) {
  const [variant, setVariant] = useState<BillingDocVariant>(defaultVariant);
  const [recipient, setRecipient] = useState(defaultRecipientEmail ?? "");
  const [ccText, setCcText] = useState("");
  const [bccText, setBccText] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [overrideContent, setOverrideContent] = useState(false);
  const [customSubject, setCustomSubject] = useState("");
  const [customIntro, setCustomIntro] = useState("");
  const [signers, setSigners] = useState<SignerOption[]>([]);
  const [selectedSignerIds, setSelectedSignerIds] = useState<Set<string>>(
    new Set(),
  );
  const [sending, setSending] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVariant(defaultVariant);
    setRecipient(defaultRecipientEmail ?? "");
    setCcText("");
    setBccText("");
    setShowCcBcc(false);
    setOverrideContent(false);
    setCustomSubject("");
    setCustomIntro("");

    (async () => {
      try {
        const res = await fetch("/api/finance/billing/signers");
        const json = await res.json();
        if (json.success) {
          const active = (json.data as Array<SignerOption & { isActive: boolean }>)
            .filter((s) => s.isActive)
            .slice(0, 3);
          setSigners(active);
          setSelectedSignerIds(new Set(active.map((s) => s.id)));
        }
      } catch {
        // best-effort
      }
    })();
  }, [open, defaultVariant, defaultRecipientEmail]);

  function toggleSigner(id: string) {
    setSelectedSignerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function parseEmails(text: string): string[] {
    return text
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
  }

  async function handlePreview() {
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/finance/billing/preview-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentVariant: variant,
          dteId,
          signerOverrideIds: Array.from(selectedSignerIds),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error generando preview");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // Limpiar después de 60s.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSend() {
    if (!recipient.trim()) {
      toast.error("El email del destinatario es requerido");
      return;
    }
    setSending(true);
    try {
      const endpoint =
        target === "draft"
          ? `/api/finance/billing/drafts/${dteId}/send-as`
          : `/api/finance/billing/issued/${dteId}/send-as`;
      const body: Record<string, unknown> = {
        variant,
        recipientEmail: recipient.trim(),
      };
      if (ccText) body.ccEmails = parseEmails(ccText);
      if (bccText) body.bccEmails = parseEmails(bccText);
      if (overrideContent && customSubject.trim()) {
        body.customSubject = customSubject.trim();
      }
      if (overrideContent && customIntro.trim()) {
        body.customIntroHtml = customIntro
          .trim()
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br/>");
      }
      if (selectedSignerIds.size > 0) {
        body.signerOverrides = Array.from(selectedSignerIds);
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "No se pudo enviar");
      }
      toast.success(
        variant === "PROFORMA"
          ? `Proforma enviada a ${recipient.trim()}`
          : `Estado de Pago enviado a ${recipient.trim()}`,
      );
      onSent?.();
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  const variantLabel =
    variant === "PROFORMA" ? "Proforma" : "Estado de Pago";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enviar {variantLabel}</DialogTitle>
          <DialogDescription>
            Envía el documento de cobro por email a {receiverName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {target === "draft" && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={variant === "PROFORMA" ? "default" : "outline"}
                size="sm"
                onClick={() => setVariant("PROFORMA")}
              >
                Proforma
              </Button>
              <Button
                variant={variant === "ESTADO_DE_PAGO" ? "default" : "outline"}
                size="sm"
                onClick={() => setVariant("ESTADO_DE_PAGO")}
              >
                Estado de Pago
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="recipient">Destinatario</Label>
            <Input
              id="recipient"
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="cliente@empresa.cl"
              className="h-10 sm:h-9"
            />
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCcBcc((v) => !v)}
            className="h-7 px-2 text-xs"
          >
            {showCcBcc ? "Ocultar" : "Agregar"} CC / BCC
          </Button>
          {showCcBcc && (
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label htmlFor="cc">CC</Label>
                <Input
                  id="cc"
                  value={ccText}
                  onChange={(e) => setCcText(e.target.value)}
                  placeholder="email1@x.cl, email2@x.cl"
                  className="h-10 sm:h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bcc">BCC</Label>
                <Input
                  id="bcc"
                  value={bccText}
                  onChange={(e) => setBccText(e.target.value)}
                  placeholder="copia-oculta@x.cl"
                  className="h-10 sm:h-9"
                />
              </div>
            </div>
          )}

          {signers.length > 0 && (
            <div className="space-y-2">
              <Label>Firmantes en el PDF</Label>
              <div className="space-y-1">
                {signers.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedSignerIds.has(s.id)}
                      onCheckedChange={() => toggleSigner(s.id)}
                    />
                    <span>{s.name}</span>
                    <span className="text-xs text-muted-foreground">· {s.role}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Switch
                checked={overrideContent}
                onCheckedChange={setOverrideContent}
              />
              <span className="text-sm">Personalizar asunto y mensaje</span>
            </div>
            {overrideContent && (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label htmlFor="subj">Asunto personalizado</Label>
                  <Input
                    id="subj"
                    value={customSubject}
                    onChange={(e) => setCustomSubject(e.target.value)}
                    className="h-10 sm:h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="intro">Mensaje personalizado</Label>
                  <Textarea
                    id="intro"
                    rows={5}
                    value={customIntro}
                    onChange={(e) => setCustomIntro(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex sm:justify-between">
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={sending || previewLoading}
          >
            {previewLoading ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Eye className="h-4 w-4 mr-1.5" />
            )}
            Vista previa PDF
          </Button>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={sending}
            >
              Cancelar
            </Button>
            <Button onClick={handleSend} disabled={sending || previewLoading}>
              {sending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1.5" />
              )}
              Enviar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
