/**
 * Modal para enviar cotización CPQ como Presentación
 * Flujo: Selección de template + destinatario → Crear borrador → Abrir preview
 * El envío real se hace desde la vista de preview (/preview/[sessionId])
 */

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
import {
  Send,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Eye,
} from "lucide-react";
import { toast } from "sonner";

interface SendCpqQuoteModalProps {
  quoteId: string;
  quoteCode: string;
  clientName?: string;
  disabled?: boolean;
  hasAccount?: boolean;
  hasContact?: boolean;
  hasDeal?: boolean;
  contactName?: string;
  contactEmail?: string;
}

interface TemplateOption {
  slug: string;
  name: string;
}

const TEMPLATES: TemplateOption[] = [
  { slug: "commercial", name: "Presentación Comercial" },
];

type Step = "template" | "recipient" | "creating" | "success";

export function SendCpqQuoteModal({
  quoteId,
  quoteCode,
  clientName,
  disabled,
  hasAccount,
  hasContact,
  hasDeal,
  contactName,
  contactEmail,
}: SendCpqQuoteModalProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("template");
  const [creating, setCreating] = useState(false);

  // Template selection
  const [selectedTemplate, setSelectedTemplate] = useState("commercial");

  // Recipient
  const [recipientName, setRecipientName] = useState(contactName || "");
  const [recipientEmail, setRecipientEmail] = useState(contactEmail || "");

  // Success state
  const [previewUrl, setPreviewUrl] = useState("");

  const canSend = hasAccount && hasContact && hasDeal;

  useEffect(() => {
    if (contactName) setRecipientName(contactName);
    if (contactEmail) setRecipientEmail(contactEmail);
  }, [contactName, contactEmail]);

  const handleCreateDraft = async () => {
    if (!canSend || !recipientEmail.trim()) return;

    setCreating(true);
    setStep("creating");
    try {
      const response = await fetch(
        `/api/cpq/quotes/${quoteId}/create-draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateSlug: selectedTemplate,
            recipientEmail: recipientEmail.trim(),
            recipientName: recipientName.trim(),
          }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al crear borrador");
      }

      setPreviewUrl(data.data?.previewUrl || "");
      setStep("success");
      toast.success("Borrador creado. Revisa la propuesta antes de enviar.");

      // Open preview in new tab
      if (data.data?.previewUrl) {
        window.open(data.data.previewUrl, "_blank");
      }
    } catch (error) {
      console.error("Error creating draft:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo crear el borrador"
      );
      setStep("recipient"); // go back to recipient step
    } finally {
      setCreating(false);
    }
  };

  const resetModal = () => {
    setStep("template");
    setSelectedTemplate("commercial");
    setPreviewUrl("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetModal();
      }}
    >
      <DialogTrigger asChild>
        <Button className="w-full h-11 gap-2 text-sm font-semibold" disabled={disabled}>
          <Send className="h-4 w-4" />
          Enviar cotización
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "template" && "Enviar propuesta"}
            {step === "recipient" && "Confirmar destinatario"}
            {step === "creating" && "Generando borrador..."}
            {step === "success" && "Borrador listo"}
          </DialogTitle>
          <DialogDescription>
            {step === "template" && `Selecciona el template para ${quoteCode}`}
            {step === "recipient" && "Confirma el destinatario y genera el borrador"}
            {step === "creating" && "Preparando la propuesta para revisión"}
            {step === "success" && "Revisa la propuesta y envíala desde la vista previa"}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Template Selection */}
        {step === "template" && (
          <div className="space-y-4">
            {/* Validation checks */}
            <div className="space-y-2">
              <CheckItem
                ok={!!hasAccount}
                label="Cuenta (empresa) asignada"
                detail={clientName}
              />
              <CheckItem ok={!!hasContact} label="Contacto con email asignado" />
              <CheckItem ok={!!hasDeal} label="Negocio vinculado" />
            </div>

            {!canSend && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-xs text-amber-400 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Asigna una cuenta, un contacto y un negocio en el paso
                  &quot;Datos&quot; antes de enviar.
                </p>
              </div>
            )}

            {canSend && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Template</Label>
                  <div className="space-y-2">
                    {TEMPLATES.map((t) => (
                      <button
                        key={t.slug}
                        type="button"
                        onClick={() => setSelectedTemplate(t.slug)}
                        className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                          selectedTemplate === t.slug
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card hover:bg-accent/30"
                        }`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={() => setStep("recipient")}
                  className="w-full gap-2"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        )}

        {/* Step 2: Recipient Confirmation */}
        {step === "recipient" && (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nombre del destinatario</Label>
                <Input
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Nombre del contacto"
                  className="bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email del destinatario *</Label>
                <Input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="correo@empresa.com"
                  className="bg-background"
                />
              </div>
            </div>

            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
              <p className="text-xs text-blue-400">
                Se creará un borrador de la propuesta. Podrás revisarla antes de
                enviarla al destinatario.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep("template")}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Atrás
              </Button>
              <Button
                onClick={handleCreateDraft}
                disabled={creating || !recipientEmail.trim()}
                className="flex-1 gap-2"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4" />
                    Ver borrador
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Creating */}
        {step === "creating" && (
          <div className="text-center py-8 space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">
              Generando borrador de propuesta...
            </p>
          </div>
        )}

        {/* Step 4: Success */}
        {step === "success" && (
          <div className="text-center py-4 space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Borrador creado</p>
              <p className="text-xs text-muted-foreground">
                La propuesta se abrió en una nueva pestaña.
                Revísala y envíala desde ahí.
              </p>
            </div>

            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir vista previa de nuevo
              </a>
            )}

            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
              <p className="text-xs text-blue-400">
                Desde la vista previa podrás verificar los datos y hacer clic en
                &quot;Enviar por Email&quot; para enviar la propuesta al cliente.
              </p>
            </div>

            <Button onClick={() => setOpen(false)} className="mt-2">
              Cerrar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CheckItem({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
      )}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>
        {label}
        {detail && (
          <span className="text-xs text-muted-foreground ml-1">
            ({detail})
          </span>
        )}
      </span>
    </div>
  );
}
