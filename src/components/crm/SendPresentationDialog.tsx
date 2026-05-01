"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Building2, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

interface SendPresentationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    account?: {
      id: string;
      name: string;
    } | null;
  };
  installations?: Array<{
    id: string;
    name: string;
    status?: string;
  }>;
  onSent?: () => void;
}

export function SendPresentationDialog({
  open,
  onOpenChange,
  contact,
  installations = [],
  onSent,
}: SendPresentationDialogProps) {
  const [sending, setSending] = useState(false);
  const [notes, setNotes] = useState("");
  const [selectedInstallation, setSelectedInstallation] = useState(
    installations.find((i) => i.status === "prospect")?.id || ""
  );

  const fullName = [contact.firstName, contact.lastName]
    .filter(Boolean)
    .join(" ");
  const prospectInstallations = installations.filter(
    (i) => i.status === "prospect"
  );

  const handleSend = async () => {
    if (!contact.email) {
      toast.error("El contacto no tiene email.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(
        `/api/crm/contacts/${contact.id}/send-presentation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notes: notes.trim() || undefined,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Error enviando presentación");
      }

      toast.success("Presentación enviada exitosamente");
      onOpenChange(false);
      setNotes("");
      onSent?.();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo enviar";
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  const inputCn =
    "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-status-info-fg" />
            Enviar Presentación de Empresa
          </DialogTitle>
          <DialogDescription>
            Se enviará un email al contacto con acceso al portal donde podrá ver
            la presentación institucional.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Contact info (read-only) */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Contacto</span>
              <span className="text-sm font-medium">{fullName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Email</span>
              <span className="text-sm">{contact.email || "Sin email"}</span>
            </div>
            {contact.account && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Empresa</span>
                <span className="text-sm">{contact.account.name}</span>
              </div>
            )}
          </div>

          {/* Installation selector (if multiple prospect installations) */}
          {prospectInstallations.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Instalación</Label>
              <select
                className={`flex h-9 w-full rounded-md border px-3 py-2 text-sm ${inputCn}`}
                value={selectedInstallation}
                onChange={(e) => setSelectedInstallation(e.target.value)}
                disabled={sending}
              >
                <option value="">Seleccionar instalación</option>
                {prospectInstallations.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">
              Mensaje personalizado (opcional)
            </Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={`flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm resize-none ${inputCn}`}
              placeholder="Incluye un mensaje personalizado para el prospecto..."
              disabled={sending}
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={sending || !contact.email}>
            {sending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Enviar Presentación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
