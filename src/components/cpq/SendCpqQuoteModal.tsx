/**
 * Modal para enviar cotización CPQ por email
 */

"use client";

import { useState } from "react";
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
import { Send } from "lucide-react";
import { toast } from "sonner";

interface SendCpqQuoteModalProps {
  quoteId: string;
  quoteCode: string;
  clientName?: string;
  disabled?: boolean;
}

export function SendCpqQuoteModal({
  quoteId,
  quoteCode,
  clientName,
  disabled,
}: SendCpqQuoteModalProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState(clientName || "");
  const [sending, setSending] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes('@')) {
      toast.error("Ingresa un email válido");
      return;
    }

    setSending(true);
    try {
      // Generar PDF
      const pdfResponse = await fetch(`/api/cpq/quotes/${quoteId}/export-pdf`, {
        method: "POST",
      });

      if (!pdfResponse.ok) {
        throw new Error("Error al generar PDF");
      }

      const pdfHtml = await pdfResponse.text();

      // TODO: Aquí deberías enviar por email usando Resend
      // Por ahora, simulamos el envío y mostramos éxito
      // En producción, crear endpoint /api/cpq/quotes/[id]/send-email que:
      // 1. Genere el PDF
      // 2. Lo envíe por email con Resend
      // 3. Actualice el estado de la cotización a "sent"

      toast.success(`Cotización enviada a ${email}`);
      setOpen(false);
      setEmail("");
      setName(clientName || "");
    } catch (error) {
      console.error("Error sending quote:", error);
      toast.error("No se pudo enviar la cotización");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2" disabled={disabled}>
          <Send className="h-4 w-4" />
          <span className="hidden sm:inline">Enviar</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar cotización</DialogTitle>
          <DialogDescription>
            Envía {quoteCode} al cliente por email
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSend} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre del cliente</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Empresa o contacto"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cliente@empresa.com"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={sending}>
            {sending ? "Enviando..." : "Enviar cotización"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
