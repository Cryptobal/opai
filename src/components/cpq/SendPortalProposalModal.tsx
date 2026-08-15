"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, FileText, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { FollowUpDecisionContent, type FollowUpDecision } from "@/components/cpq/FollowUpDecisionModal";
import { cn } from "@/lib/utils";
import { parseResponseJson } from "@/lib/parse-response-json";

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  roleTitle?: string | null;
};

type Step = "compose" | "followup";

interface SendPortalProposalModalProps {
  quoteId: string;
  quoteCode: string;
  /** Asunto sugerido del correo (editable; coincide con el que usa el servidor si no lo cambias). */
  defaultEmailSubject: string;
  dealId: string;
  /** Cuenta CRM: se listan todos sus contactos con email como destinatarios portal. */
  accountId: string;
  /** Contacto principal de la cotización (preseleccionado como destinatario portal) */
  quoteContact: ContactRow;
  /**
   * La cotización incluye dotación de guardias. Si es false, la Propuesta
   * Técnica no aplica (es un dossier de servicio con personal) y no se ofrece.
   */
  hasGuards: boolean;
  disabled?: boolean;
  onBeforeSend?: () => Promise<void>;
  /** Tras envío OK (para WhatsApp, refresh, etc.) */
  onComplete?: (args: {
    decision: FollowUpDecision;
    result: {
      sentTo: string;
      sentToList?: string[];
      whatsappMessage?: string;
      whatsappPhone?: string | null;
      pinGenerated?: boolean;
    };
  }) => void;
  /** Botón que abre el modal (opcional si usas open/onOpenChange controlado) */
  trigger?: React.ReactNode;
  className?: string;
  /** Modo controlado: mismo modal desde barra superior y panel financiero */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SendPortalProposalModal({
  quoteId,
  quoteCode,
  defaultEmailSubject,
  dealId,
  accountId,
  quoteContact,
  hasGuards,
  disabled,
  onBeforeSend,
  onComplete,
  trigger,
  className,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: SendPortalProposalModalProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen! : uncontrolledOpen;
  const setOpen = useCallback(
    (v: boolean) => {
      controlledOnOpenChange?.(v);
      if (!isControlled) setUncontrolledOpen(v);
    },
    [controlledOnOpenChange, isControlled]
  );
  const [step, setStep] = useState<Step>("compose");
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [accountContacts, setAccountContacts] = useState<ContactRow[]>([]);
  const [portalRecipientIds, setPortalRecipientIds] = useState<Set<string>>(
    () => new Set([quoteContact.id]),
  );
  const [ccIds, setCcIds] = useState<Set<string>>(new Set());
  const [ccManual, setCcManual] = useState("");
  const [bccManual, setBccManual] = useState("");
  const [emailSubject, setEmailSubject] = useState(defaultEmailSubject);
  const [includeQuotationPdf, setIncludeQuotationPdf] = useState(true);
  const [includeProposalPdf, setIncludeProposalPdf] = useState(hasGuards);
  const [sending, setSending] = useState(false);
  const [quoteAttachments, setQuoteAttachments] = useState<
    { id: string; fileName: string; mimeType: string; size: number }[]
  >([]);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<Set<string>>(new Set());

  const allContacts = useMemo(() => {
    const map = new Map<string, ContactRow>();
    const add = (c: ContactRow) => {
      if (c.email) map.set(c.id, c);
    };
    add(quoteContact);
    accountContacts.forEach(add);
    return Array.from(map.values());
  }, [quoteContact, accountContacts]);

  const portalRecipients = useMemo(
    () => allContacts.filter((c) => portalRecipientIds.has(c.id)),
    [allContacts, portalRecipientIds],
  );

  const ccCandidates = useMemo(
    () => allContacts.filter((c) => !portalRecipientIds.has(c.id)),
    [allContacts, portalRecipientIds],
  );

  useEffect(() => {
    if (!open || !accountId) return;
    setLoadingContacts(true);
    fetch(`/api/crm/contacts?accountId=${encodeURIComponent(accountId)}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          const rows: ContactRow[] = res.data
            .map((c: ContactRow) => ({
              id: c.id,
              firstName: c.firstName,
              lastName: c.lastName,
              email: c.email,
              roleTitle: c.roleTitle ?? null,
            }))
            .filter((c: ContactRow) => c?.id && c?.email);
          setAccountContacts(rows);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingContacts(false));
  }, [open, accountId]);

  useEffect(() => {
    if (!open) {
      setStep("compose");
      return;
    }
    setStep("compose");
    setPortalRecipientIds(new Set([quoteContact.id]));
    setCcIds(new Set());
    setCcManual("");
    setBccManual("");
    setEmailSubject(defaultEmailSubject);
    setIncludeQuotationPdf(true);
    setIncludeProposalPdf(hasGuards);
    setSelectedAttachmentIds(new Set());
  }, [open, quoteContact.id, defaultEmailSubject, hasGuards]);

  useEffect(() => {
    if (!open || !quoteId) return;
    fetch(`/api/cpq/quotes/${quoteId}/attachments`)
      .then((r) => r.json())
      .then((res) => {
        if (Array.isArray(res)) setQuoteAttachments(res);
        else if (res.success && Array.isArray(res.data)) setQuoteAttachments(res.data);
        else setQuoteAttachments([]);
      })
      .catch(() => setQuoteAttachments([]));
  }, [open, quoteId]);

  const togglePortalRecipient = useCallback((id: string) => {
    setPortalRecipientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // No dejar la lista vacía
        if (next.size <= 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setCcIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggleCc = useCallback((id: string) => {
    setCcIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const parseEmails = (raw: string) =>
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes("@"));

  const handleComposeNext = () => {
    if (portalRecipients.length === 0) {
      toast.error("Selecciona al menos un contacto con correo válido");
      return;
    }
    if (!emailSubject.trim()) {
      toast.error("Escribe un asunto para el correo");
      return;
    }
    setStep("followup");
  };

  const sendPortal = async (decision: FollowUpDecision) => {
    if (portalRecipients.length === 0) return;
    setSending(true);
    try {
      if (onBeforeSend) await onBeforeSend();
      const ccExtra = parseEmails(ccManual);
      const bccExtra = parseEmails(bccManual);
      const recipientContactIds = portalRecipients.map((c) => c.id);
      const portalIdSet = new Set(recipientContactIds);
      const ccContactIds = Array.from(ccIds).filter((id) => !portalIdSet.has(id));
      const response = await fetch(`/api/cpq/quotes/${quoteId}/send-portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientContactIds,
          ccContactIds,
          ccEmails: ccExtra,
          bccEmails: bccExtra,
          emailSubject: emailSubject.trim(),
          includeQuotationPdf,
          // Sin dotación la propuesta técnica no aplica: aunque el estado
          // quedara en true (se marcó y después se borraron los puestos), no se
          // manda. El backend igual lo revalida.
          includeProposalPdf: hasGuards && includeProposalPdf,
          attachmentIds: Array.from(selectedAttachmentIds),
          followUp: {
            include: decision.includeFollowUp,
            targetStageId: decision.targetStageId,
            skipAll: decision.skipAll ?? false,
          },
        }),
      });
      const payload = await parseResponseJson<{
        success?: boolean;
        error?: string;
        data?: {
          sentTo: string;
          sentToList?: string[];
          pinGenerated?: boolean;
          whatsappMessage?: string;
          whatsappPhone?: string | null;
        };
      }>(response);
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo enviar");
      }
      const data = payload.data;
      if (!data?.sentTo) {
        throw new Error("Respuesta incompleta del servidor");
      }
      const count = data.sentToList?.length ?? 1;
      toast.success(
        count > 1
          ? `Invitación enviada a ${count} contactos. ${data.pinGenerated ? "Se generaron/reutilizaron PINs de acceso." : "PIN existente."}`
          : `Invitación enviada a ${data.sentTo}. ${data.pinGenerated ? "Se generó PIN de acceso." : "PIN existente."}`
      );
      onComplete?.({
        decision,
        result: {
          sentTo: data.sentTo,
          sentToList: data.sentToList,
          whatsappMessage: data.whatsappMessage,
          whatsappPhone: data.whatsappPhone,
          pinGenerated: data.pinGenerated,
        },
      });
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al enviar");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild disabled={disabled}>
          <span className={cn(className)}>{trigger}</span>
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "compose" ? "Enviar propuesta al portal" : "Seguimiento del negocio"}
          </DialogTitle>
          <DialogDescription>
            {step === "compose"
              ? `Cotización ${quoteCode}: asunto, destinatarios, adjuntos y copias. Luego configura el seguimiento.`
              : "Define el seguimiento antes de enviar la invitación."}
          </DialogDescription>
        </DialogHeader>

        {step === "compose" ? (
          <div className="space-y-4">
            {loadingContacts ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando contactos de la cuenta…
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Asunto del correo</Label>
                  <Input
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Propuesta · CPQ-… — …"
                    className="bg-background text-sm"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Texto sugerido; puedes editarlo antes de enviar.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">
                    Destinatarios portal (correo + PIN individual)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Cada contacto seleccionado recibe su propio correo con su PIN de acceso.
                  </p>
                  <div className="space-y-2 rounded-md border border-border p-2 max-h-48 overflow-y-auto">
                    {allContacts.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 cursor-pointer text-sm py-1 min-h-11"
                      >
                        <input
                          type="checkbox"
                          checked={portalRecipientIds.has(c.id)}
                          onChange={() => togglePortalRecipient(c.id)}
                        />
                        <span className="truncate">
                          {c.firstName} {c.lastName}
                          {c.roleTitle ? ` · ${c.roleTitle}` : ""}
                          {c.id === quoteContact.id ? " (cotización)" : ""}
                        </span>
                        <span className="text-muted-foreground text-xs truncate">{c.email}</span>
                      </label>
                    ))}
                    {allContacts.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No hay contactos con email en la cuenta.
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">
                    En copia (sin PIN propio)
                  </Label>
                  <div className="space-y-1 rounded-md border border-border p-2 max-h-32 overflow-y-auto">
                    {ccCandidates.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 cursor-pointer text-sm py-0.5 min-h-11">
                        <input
                          type="checkbox"
                          checked={ccIds.has(c.id)}
                          onChange={() => toggleCc(c.id)}
                        />
                        <span className="truncate text-xs">
                          {c.firstName} {c.lastName} — {c.email}
                        </span>
                      </label>
                    ))}
                    {ccCandidates.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No hay otros contactos con email fuera de los destinatarios portal.
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">CC adicional (emails separados por coma)</Label>
                  <Input
                    value={ccManual}
                    onChange={(e) => setCcManual(e.target.value)}
                    placeholder="otro@empresa.com"
                    className="bg-background text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">CCO (opcional)</Label>
                  <Input
                    value={bccManual}
                    onChange={(e) => setBccManual(e.target.value)}
                    placeholder="oculto@empresa.com"
                    className="bg-background text-sm"
                  />
                </div>

                <div className="space-y-2 rounded-md border border-border/60 p-3 bg-muted/20">
                  <Label className="text-xs font-semibold">Adjuntos al correo</Label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={includeQuotationPdf}
                      onChange={(e) => setIncludeQuotationPdf(e.target.checked)}
                      className="rounded border-border"
                    />
                    <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                    PDF cotización (económica)
                  </label>
                  {hasGuards ? (
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={includeProposalPdf}
                        onChange={(e) => setIncludeProposalPdf(e.target.checked)}
                        className="rounded border-border"
                      />
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      Propuesta técnica (PDF extendido)
                    </label>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Esta cotización no incluye dotación de guardias: la propuesta
                      técnica no aplica y no se envía.
                    </p>
                  )}
                  {quoteAttachments.length > 0 && (
                    <>
                      <div className="border-t border-border/40 my-1" />
                      <p className="text-xs text-muted-foreground">Documentos adjuntos de la cotización</p>
                      {quoteAttachments.map((att) => (
                        <label key={att.id} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={selectedAttachmentIds.has(att.id)}
                            onChange={() =>
                              setSelectedAttachmentIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(att.id)) next.delete(att.id);
                                else next.add(att.id);
                                return next;
                              })
                            }
                            className="rounded border-border"
                          />
                          <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="break-all">{att.fileName}</span>
                        </label>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                className="flex-1 gap-2 bg-status-ok hover:brightness-110 text-white"
                onClick={handleComposeNext}
                disabled={loadingContacts || portalRecipients.length === 0}
              >
                Continuar
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="w-fit gap-1 -mt-2 mb-1 text-xs text-muted-foreground"
              onClick={() => setStep("compose")}
            >
              ← Volver
            </Button>
            <FollowUpDecisionContent
              dealId={dealId}
              showWhatsApp
              showProposalPdf={false}
              onConfirm={(d) => void sendPortal(d)}
              onCancel={() => setOpen(false)}
              loading={sending}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
