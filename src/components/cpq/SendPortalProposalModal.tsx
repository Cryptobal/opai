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
import { Send, Loader2, FileText, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { FollowUpDecisionContent, type FollowUpDecision } from "@/components/cpq/FollowUpDecisionModal";
import { cn } from "@/lib/utils";

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
  dealId: string;
  /** Contacto principal de la cotización (por defecto destinatario) */
  quoteContact: ContactRow;
  disabled?: boolean;
  onBeforeSend?: () => Promise<void>;
  /** Tras envío OK (para WhatsApp, refresh, etc.) */
  onComplete?: (args: {
    decision: FollowUpDecision;
    result: {
      sentTo: string;
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
  dealId,
  quoteContact,
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
  const [dealContacts, setDealContacts] = useState<ContactRow[]>([]);
  const [primaryId, setPrimaryId] = useState(quoteContact.id);
  const [ccIds, setCcIds] = useState<Set<string>>(new Set());
  const [ccManual, setCcManual] = useState("");
  const [bccManual, setBccManual] = useState("");
  const [includeQuotationPdf, setIncludeQuotationPdf] = useState(true);
  const [includeProposalPdf, setIncludeProposalPdf] = useState(false);
  const [sending, setSending] = useState(false);

  const allContacts = useMemo(() => {
    const map = new Map<string, ContactRow>();
    const add = (c: ContactRow) => {
      if (c.email) map.set(c.id, c);
    };
    add(quoteContact);
    dealContacts.forEach(add);
    return Array.from(map.values());
  }, [quoteContact, dealContacts]);

  useEffect(() => {
    if (!open || !dealId) return;
    setLoadingContacts(true);
    fetch(`/api/crm/deals/${dealId}/contacts`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          const rows: ContactRow[] = res.data
            .map((dc: { contact: ContactRow }) => dc.contact)
            .filter((c: ContactRow) => c?.email);
          setDealContacts(rows);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingContacts(false));
  }, [open, dealId]);

  useEffect(() => {
    if (!open) {
      setStep("compose");
      return;
    }
    setStep("compose");
    setPrimaryId(quoteContact.id);
    setCcIds(new Set());
    setCcManual("");
    setBccManual("");
    setIncludeQuotationPdf(true);
    setIncludeProposalPdf(false);
  }, [open, quoteContact.id]);

  const toggleCc = useCallback((id: string) => {
    if (id === primaryId) return;
    setCcIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [primaryId]);

  const primary = allContacts.find((c) => c.id === primaryId) ?? allContacts[0];

  const parseEmails = (raw: string) =>
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes("@"));

  const handleComposeNext = () => {
    if (!primary?.email) {
      toast.error("Selecciona un contacto con correo válido");
      return;
    }
    setStep("followup");
  };

  const sendPortal = async (decision: FollowUpDecision) => {
    if (!primary?.email) return;
    setSending(true);
    try {
      if (onBeforeSend) await onBeforeSend();
      const ccExtra = parseEmails(ccManual);
      const bccExtra = parseEmails(bccManual);
      const ccContactIds = Array.from(ccIds).filter((id) => id !== primaryId);
      const response = await fetch(`/api/cpq/quotes/${quoteId}/send-portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientContactId: primary.id,
          ccContactIds,
          ccEmails: ccExtra,
          bccEmails: bccExtra,
          includeQuotationPdf,
          includeProposalPdf,
          followUp: {
            include: decision.includeFollowUp,
            targetStageId: decision.targetStageId,
            skipAll: decision.skipAll ?? false,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo enviar");
      }
      toast.success(
        `Invitación enviada a ${payload.data.sentTo}. ${payload.data.pinGenerated ? "Se generó PIN de acceso." : "PIN existente."}`
      );
      onComplete?.({
        decision,
        result: {
          sentTo: payload.data.sentTo,
          whatsappMessage: payload.data.whatsappMessage,
          whatsappPhone: payload.data.whatsappPhone,
          pinGenerated: payload.data.pinGenerated,
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
              ? `Cotización ${quoteCode}: elige destinatario, adjuntos y copias. Luego configura el seguimiento.`
              : "Define el seguimiento antes de enviar la invitación."}
          </DialogDescription>
        </DialogHeader>

        {step === "compose" ? (
          <div className="space-y-4">
            {loadingContacts ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando contactos del negocio…
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Destinatario principal (portal + PIN)</Label>
                  <div className="space-y-2 rounded-md border border-border p-2 max-h-40 overflow-y-auto">
                    {allContacts.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 cursor-pointer text-sm py-1"
                      >
                        <input
                          type="radio"
                          name="primary-contact"
                          checked={primaryId === c.id}
                          onChange={() => {
                            setPrimaryId(c.id);
                            setCcIds((prev) => {
                              const n = new Set(prev);
                              n.delete(c.id);
                              return n;
                            });
                          }}
                        />
                        <span className="truncate">
                          {c.firstName} {c.lastName}
                          {c.roleTitle ? ` · ${c.roleTitle}` : ""}
                        </span>
                        <span className="text-muted-foreground text-xs truncate">{c.email}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">En copia (contactos del negocio)</Label>
                  <div className="space-y-1 rounded-md border border-border p-2 max-h-32 overflow-y-auto">
                    {allContacts
                      .filter((c) => c.id !== primaryId)
                      .map((c) => (
                        <label key={c.id} className="flex items-center gap-2 cursor-pointer text-sm py-0.5">
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
                    {allContacts.filter((c) => c.id !== primaryId).length === 0 && (
                      <p className="text-xs text-muted-foreground">No hay otros contactos con email en el negocio.</p>
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
                </div>
              </>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleComposeNext} disabled={loadingContacts || !primary?.email}>
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
