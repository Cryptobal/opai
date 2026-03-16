"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Loader2, Send, RefreshCw, Paperclip, CheckCircle2, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { FollowUpDecisionContent, type FollowUpDecision } from "@/components/cpq/FollowUpDecisionModal";

interface SendPdfEmailModalProps {
  quoteId: string;
  quoteCode: string;
  contactEmail?: string;
  contactName?: string;
  companyName?: string;
  disabled?: boolean;
  dealId?: string;
  /** Compact trigger for header placement */
  triggerClassName?: string;
  /** Called before sending to flush pending saves */
  onBeforeSend?: () => Promise<void>;
}

type Step = "compose" | "followup" | "sent";

export function SendPdfEmailModal({
  quoteId,
  quoteCode,
  contactEmail,
  contactName,
  companyName,
  disabled,
  dealId,
  triggerClassName,
  onBeforeSend,
}: SendPdfEmailModalProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("compose");
  const [to, setTo] = useState(contactEmail || "");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [generatingBody, setGeneratingBody] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (contactEmail) setTo(contactEmail);
  }, [contactEmail]);

  useEffect(() => {
    setSubject(`Propuesta economica ${quoteCode}${companyName ? ` - ${companyName}` : ""}`);
  }, [quoteCode, companyName]);

  const generateBody = async (customInstruction?: string) => {
    setGeneratingBody(true);
    try {
      const res = await fetch("/api/ai/quote-email-body", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId, customInstruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error generando email");
      setEmailBody(data.data.body);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error generando email"
      );
    } finally {
      setGeneratingBody(false);
    }
  };

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setStep("compose");
      setCc("");
      setBcc("");
      setAiPrompt("");
      generateBody();
    }
  };

  const handleRegenerate = () => {
    generateBody(aiPrompt || undefined);
  };

  const handleGoToFollowUp = () => {
    if (!to || !subject || !emailBody) {
      toast.error("Completa todos los campos requeridos");
      return;
    }
    if (dealId) {
      setStep("followup");
    } else {
      // No deal linked — send directly without follow-up decision
      handleSend();
    }
  };

  const handleFollowUpConfirm = (decision: FollowUpDecision) => {
    handleSend(decision);
  };

  const handleSend = async (followUp?: FollowUpDecision) => {
    if (!to || !subject || !emailBody) {
      toast.error("Completa todos los campos requeridos");
      return;
    }
    setSending(true);
    try {
      if (onBeforeSend) await onBeforeSend();
      const res = await fetch(`/api/cpq/quotes/${quoteId}/send-pdf-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          cc: cc || undefined,
          bcc: bcc || undefined,
          subject,
          htmlBody: emailBody,
          ...(followUp && {
            followUp: {
              include: followUp.includeFollowUp,
              targetStageId: followUp.targetStageId,
            },
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al enviar");
      setStep("sent");
      toast.success("Mail enviado");
      setTimeout(() => {
        setOpen(false);
      }, 3000);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al enviar email"
      );
      // Go back to compose if it was on followup step
      if (step === "followup") setStep("compose");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className={triggerClassName ?? "w-full h-11 gap-2 text-sm font-semibold"}
          disabled={disabled}
        >
          <Mail className="h-4 w-4" />
          Enviar PDF
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "followup" ? "Opciones de seguimiento" : "Enviar PDF por email"}
          </DialogTitle>
          <DialogDescription>
            {step === "followup"
              ? "Configura el seguimiento antes de enviar"
              : `Envia la cotizacion ${quoteCode} como PDF adjunto`}
          </DialogDescription>
        </DialogHeader>

        {step === "sent" ? (
          <div className="text-center py-6 space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
            <p className="text-sm font-medium">Mail enviado</p>
            <p className="text-xs text-muted-foreground">
              El PDF fue enviado a {to}
            </p>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
          </div>
        ) : step === "followup" && dealId ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep("compose")}
              className="w-fit gap-1 -mt-2 mb-1 text-xs text-muted-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              Volver al email
            </Button>
            <FollowUpDecisionContent
              dealId={dealId}
              onConfirm={handleFollowUpConfirm}
              onCancel={() => setStep("compose")}
              loading={sending}
            />
          </>
        ) : (
        <div className="space-y-4">
          {/* To */}
          <div className="space-y-1.5">
            <Label className="text-xs">Para *</Label>
            <Input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="correo@empresa.com"
              className="bg-background"
            />
          </div>

          {/* CC */}
          <div className="space-y-1.5">
            <Label className="text-xs">CC</Label>
            <Input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="email1@empresa.com, email2@empresa.com"
              className="bg-background"
            />
          </div>

          {/* BCC */}
          <div className="space-y-1.5">
            <Label className="text-xs">CCO</Label>
            <Input
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              placeholder="email@empresa.com"
              className="bg-background"
            />
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <Label className="text-xs">Asunto *</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="bg-background"
            />
          </div>

          {/* PDF Badge */}
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
            <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">
              {quoteCode}-propuesta.pdf
            </span>
          </div>

          {/* Email Body */}
          <div className="space-y-1.5">
            <Label className="text-xs">Cuerpo del email *</Label>
            {generatingBody ? (
              <div className="flex items-center justify-center py-8 rounded-md border border-border bg-muted/30">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                <span className="text-sm text-muted-foreground">
                  Generando email con IA...
                </span>
              </div>
            ) : (
              <Textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={8}
                className="bg-background text-sm resize-none"
              />
            )}
          </div>

          {/* AI Prompt */}
          <div className="space-y-1.5">
            <Label className="text-xs">Prompt IA (opcional)</Label>
            <div className="flex gap-2">
              <Input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="ej: tono formal, mencionar urgencia..."
                className="bg-background flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleRegenerate();
                  }
                }}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleRegenerate}
                disabled={generatingBody}
                title="Regenerar email"
              >
                <RefreshCw className={`h-4 w-4 ${generatingBody ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleGoToFollowUp}
              disabled={sending || generatingBody || !to || !emailBody}
              className="flex-1 gap-2"
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Enviar PDF
                </>
              )}
            </Button>
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
