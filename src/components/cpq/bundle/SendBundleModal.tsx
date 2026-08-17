"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, FileText, Paperclip, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import {
  FollowUpDecisionContent,
  type FollowUpDecision,
} from "@/components/cpq/FollowUpDecisionModal";
import { parseResponseJson } from "@/lib/parse-response-json";
import { buildDefaultPortalInviteEmailSubject } from "@/lib/cpq-portal-email-subject";
import type { BundleDetail } from "./useBundle";

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  roleTitle?: string | null;
};

type Step = "compose" | "followup";

function buildWaMeUrl(phone: string | null | undefined, message: string): string {
  const encoded = encodeURIComponent(message);
  const cleaned = (phone ?? "").trim();
  return cleaned
    ? `https://wa.me/${cleaned}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

export function SendBundleModal({
  open,
  onOpenChange,
  bundle,
  tenantBrandName,
  onSent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  bundle: BundleDetail;
  tenantBrandName?: string;
  onSent: () => Promise<void>;
}) {
  const quoteContact: ContactRow | null = bundle.contact
    ? {
        id: bundle.contact.id,
        firstName: bundle.contact.firstName,
        lastName: bundle.contact.lastName,
        email: bundle.contact.email,
      }
    : null;
  const hasGuards = bundle.totals.totalGuards > 0;
  const included = bundle.totals.includedCount;
  const suggestedSubject = buildDefaultPortalInviteEmailSubject({
    quoteCode: bundle.code,
    quoteName: bundle.name || bundle.account?.name,
    tenantBrand: tenantBrandName,
  });

  const [step, setStep] = useState<Step>("compose");
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [accountContacts, setAccountContacts] = useState<ContactRow[]>([]);
  const [portalRecipientIds, setPortalRecipientIds] = useState<Set<string>>(
    () => new Set(quoteContact?.id ? [quoteContact.id] : []),
  );
  const [ccIds, setCcIds] = useState<Set<string>>(new Set());
  const [ccManual, setCcManual] = useState("");
  const [bccManual, setBccManual] = useState("");
  const [emailSubject, setEmailSubject] = useState(suggestedSubject);
  const [includeQuotationPdf, setIncludeQuotationPdf] = useState(false);
  const [includeProposalPdf, setIncludeProposalPdf] = useState(true);
  const [sending, setSending] = useState(false);
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [whatsappSentTo, setWhatsappSentTo] = useState("");

  const allContacts = useMemo(() => {
    const map = new Map<string, ContactRow>();
    const add = (c: ContactRow) => {
      if (c.email) map.set(c.id, c);
    };
    if (quoteContact) add(quoteContact);
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
    if (!open || !bundle.accountId) return;
    setLoadingContacts(true);
    fetch(`/api/crm/contacts?accountId=${encodeURIComponent(bundle.accountId)}`)
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
  }, [open, bundle.accountId]);

  useEffect(() => {
    if (!open) {
      setStep("compose");
      return;
    }
    setStep("compose");
    setPortalRecipientIds(new Set(quoteContact?.id ? [quoteContact.id] : []));
    setCcIds(new Set());
    setCcManual("");
    setBccManual("");
    setEmailSubject(suggestedSubject);
    setIncludeQuotationPdf(false);
    setIncludeProposalPdf(hasGuards);
  }, [open, quoteContact?.id, suggestedSubject, hasGuards]);

  const togglePortalRecipient = useCallback((id: string) => {
    setPortalRecipientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
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
    if (!bundle.dealId) {
      toast.error("La propuesta debe tener un negocio asignado");
      return;
    }
    setStep("followup");
  };

  const sendPortal = async (decision: FollowUpDecision) => {
    if (portalRecipients.length === 0) return;
    setSending(true);
    try {
      const ccExtra = parseEmails(ccManual);
      const bccExtra = parseEmails(bccManual);
      const recipientContactIds = portalRecipients.map((c) => c.id);
      const portalIdSet = new Set(recipientContactIds);
      const ccContactIds = Array.from(ccIds).filter((id) => !portalIdSet.has(id));
      const response = await fetch(
        `/api/cpq/bundles/${bundle.id}/send-presentation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientContactIds,
            ccContactIds,
            ccEmails: ccExtra,
            bccEmails: bccExtra,
            emailSubject: emailSubject.trim(),
            includeQuotationPdf,
            includeProposalPdf: hasGuards && includeProposalPdf,
            followUp: {
              include: decision.includeFollowUp,
              targetStageId: decision.targetStageId,
              skipAll: decision.skipAll ?? false,
            },
          }),
        },
      );
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
          : `Invitación enviada a ${data.sentTo}. ${data.pinGenerated ? "Se generó PIN de acceso." : "PIN existente."}`,
      );
      onOpenChange(false);
      await onSent();

      if (decision.sendWhatsApp === true && data.whatsappMessage) {
        setWhatsappUrl(buildWaMeUrl(data.whatsappPhone, data.whatsappMessage));
        setWhatsappSentTo(data.sentTo);
        setWhatsappModalOpen(true);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al enviar");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] min-w-0 w-full flex-col gap-0 overflow-hidden p-0 px-0 pt-0 pb-0 sm:max-w-xl sm:max-h-[85dvh]">
        <DialogHeader className="shrink-0 space-y-1.5 px-5 pb-3 pt-6 pr-12">
          <DialogTitle>
            {step === "compose"
              ? "Enviar propuesta consolidada"
              : "Seguimiento del negocio"}
          </DialogTitle>
          <DialogDescription>
            {step === "compose"
              ? `${bundle.code} · ${included} instalación${included === 1 ? "" : "es"}. Cada destinatario recibe su PIN; CC y CCO van en el primer correo.`
              : "Define el seguimiento antes de enviar la invitación."}
          </DialogDescription>
        </DialogHeader>

        {step === "compose" ? (
          <>
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-5">
              {loadingContacts ? (
                <div className="flex items-center gap-2 py-4 text-sm text-ds-text-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando contactos de la cuenta…
                </div>
              ) : (
                <div className="space-y-4 pb-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Asunto del correo</Label>
                    <Input
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Propuesta · PROP-… — …"
                      className="h-10 bg-background text-sm sm:h-9"
                      autoComplete="off"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">
                      Destinatarios portal (correo + PIN individual)
                    </Label>
                    <p className="text-xs text-ds-text-3">
                      Cada contacto seleccionado recibe su propio correo con su PIN.
                    </p>
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-ds-border-default p-2">
                      {allContacts.map((c) => (
                        <label
                          key={c.id}
                          className="flex min-h-11 min-w-0 cursor-pointer items-start gap-2 py-1 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="mt-1 shrink-0"
                            checked={portalRecipientIds.has(c.id)}
                            onChange={() => togglePortalRecipient(c.id)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-foreground">
                              {c.firstName} {c.lastName}
                              {c.roleTitle ? ` · ${c.roleTitle}` : ""}
                              {quoteContact && c.id === quoteContact.id ? " (propuesta)" : ""}
                            </span>
                            <span className="block truncate text-xs text-ds-text-3">
                              {c.email}
                            </span>
                          </span>
                        </label>
                      ))}
                      {allContacts.length === 0 && (
                        <p className="text-xs text-ds-text-3">
                          No hay contactos con email en la cuenta.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">
                      En copia (sin PIN propio)
                    </Label>
                    <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-ds-border-default p-2">
                      {ccCandidates.map((c) => (
                        <label
                          key={c.id}
                          className="flex min-h-11 min-w-0 cursor-pointer items-start gap-2 py-1 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="mt-1 shrink-0"
                            checked={ccIds.has(c.id)}
                            onChange={() => toggleCc(c.id)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">
                              {c.firstName} {c.lastName}
                            </span>
                            <span className="block truncate text-xs text-ds-text-3">
                              {c.email}
                            </span>
                          </span>
                        </label>
                      ))}
                      {ccCandidates.length === 0 && (
                        <p className="text-xs text-ds-text-3">
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
                      className="h-10 bg-background text-sm sm:h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">CCO (opcional)</Label>
                    <Input
                      value={bccManual}
                      onChange={(e) => setBccManual(e.target.value)}
                      placeholder="oculto@empresa.com"
                      className="h-10 bg-background text-sm sm:h-9"
                    />
                  </div>

                  <div className="space-y-2 rounded-md border border-ds-border-subtle bg-ds-surface-2/40 p-3">
                    <Label className="text-xs font-semibold">Adjuntos al correo</Label>
                    <label className="flex min-h-11 min-w-0 cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={includeQuotationPdf}
                        onChange={(e) => setIncludeQuotationPdf(e.target.checked)}
                        className="mt-1 shrink-0 rounded border-border"
                      />
                      <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-ds-text-3" />
                      <span className="min-w-0 leading-snug">
                        PDF cotización (económica, una por instalación incluida)
                      </span>
                    </label>
                    {hasGuards ? (
                      <label className="flex min-h-11 min-w-0 cursor-pointer items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={includeProposalPdf}
                          onChange={(e) => setIncludeProposalPdf(e.target.checked)}
                          className="mt-1 shrink-0 rounded border-border"
                        />
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ds-text-3" />
                        <span className="min-w-0 leading-snug">
                          Propuesta técnica consolidada (PDF extendido)
                        </span>
                      </label>
                    ) : (
                      <p className="text-xs text-ds-text-3">
                        Esta propuesta no incluye dotación de guardias: la propuesta
                        técnica no aplica y no se envía.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-2 border-t border-ds-border-subtle px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button
                variant="outline"
                className="h-10 min-w-0 flex-1 sm:h-9"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                className="h-10 min-w-0 flex-1 gap-2 bg-status-ok text-white hover:brightness-110 sm:h-9"
                onClick={handleComposeNext}
                disabled={loadingContacts || portalRecipients.length === 0 || included === 0}
              >
                Continuar
              </Button>
            </div>
          </>
        ) : (
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 pb-4">
            <Button
              variant="ghost"
              size="sm"
              className="mb-1 -mt-1 w-fit gap-1 text-xs text-ds-text-3"
              onClick={() => setStep("compose")}
            >
              ← Volver
            </Button>
            <FollowUpDecisionContent
              dealId={bundle.dealId}
              showWhatsApp
              showProposalPdf={false}
              onConfirm={(d) => void sendPortal(d)}
              onCancel={() => onOpenChange(false)}
              loading={sending}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>

    <Dialog open={whatsappModalOpen} onOpenChange={setWhatsappModalOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-status-ok-fg" />
            Compartir por WhatsApp
          </DialogTitle>
          <DialogDescription>
            Email enviado a{" "}
            <strong className="text-foreground">{whatsappSentTo}</strong>. Haz clic
            para enviarle el mismo mensaje por WhatsApp.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 pt-1">
          <Button
            className="w-full gap-2 bg-status-ok text-white hover:brightness-110"
            onClick={() => {
              if (whatsappUrl) window.open(whatsappUrl, "_blank");
              setWhatsappModalOpen(false);
            }}
          >
            <MessageCircle className="h-4 w-4" />
            Compartir por WhatsApp
          </Button>
          <Button
            variant="ghost"
            className="w-full text-xs text-muted-foreground"
            onClick={() => setWhatsappModalOpen(false)}
          >
            Ahora no
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
