"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Mail, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GUARDIA_COMM_TEMPLATES } from "@/lib/personas";

type HistoryEvent = {
  id: string;
  eventType: string;
  newValue?: Record<string, unknown> | null;
  reason?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
};

interface CommunicationSectionProps {
  guardiaId: string;
  email?: string | null;
  phoneMobile?: string | null;
  historyEvents: HistoryEvent[];
  onHistoryEventAdded: (event: HistoryEvent) => void;
}

export default function CommunicationSection({
  guardiaId,
  email,
  phoneMobile,
  historyEvents,
  onHistoryEventAdded,
}: CommunicationSectionProps) {
  const [sendingComm, setSendingComm] = useState(false);
  const [commForm, setCommForm] = useState({
    channel: "email",
    templateId: GUARDIA_COMM_TEMPLATES.find((t) => t.channel === "email")?.id ?? "",
  });

  const availableTemplates = useMemo(
    () => GUARDIA_COMM_TEMPLATES.filter((tpl) => tpl.channel === commForm.channel),
    [commForm.channel]
  );

  const communicationHistory = useMemo(
    () => historyEvents.filter((event) => event.eventType === "communication_sent"),
    [historyEvents]
  );

  const handleSendCommunication = async () => {
    if (!commForm.templateId) {
      toast.error("Selecciona una plantilla");
      return;
    }
    setSendingComm(true);
    try {
      const response = await fetch(`/api/personas/guardias/${guardiaId}/communications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: commForm.channel,
          templateId: commForm.templateId,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo enviar comunicación");
      }

      if (payload.data?.event) {
        onHistoryEventAdded(payload.data.event);
      }

      const waLink = payload.data?.waLink as string | undefined;
      if (commForm.channel === "whatsapp" && waLink) {
        window.open(waLink, "_blank", "noopener,noreferrer");
        toast.success("Se abrió WhatsApp con el mensaje");
      } else {
        toast.success("Comunicación registrada");
      }
    } catch (error) {
      console.error(error);
      toast.error("No se pudo enviar comunicación");
    } finally {
      setSendingComm(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Envío con plantillas predefinidas por canal. Los envíos quedan registrados en la ficha.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <select
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            value={commForm.channel}
            onChange={(e) => {
              const nextChannel = e.target.value;
              const firstTemplate = GUARDIA_COMM_TEMPLATES.find((tpl) => tpl.channel === nextChannel)?.id ?? "";
              setCommForm({ channel: nextChannel, templateId: firstTemplate });
            }}
          >
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
          </select>

          <select
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            value={commForm.templateId}
            onChange={(e) => setCommForm((prev) => ({ ...prev, templateId: e.target.value }))}
          >
            {availableTemplates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>

          <Button onClick={handleSendCommunication} disabled={sendingComm || !commForm.templateId}>
            <Send className="h-4 w-4 mr-1" />
            {sendingComm ? "Enviando..." : "Enviar comunicación"}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Email: {email || "No registrado"}</span>
          <span>·</span>
          <span>Celular: {phoneMobile ? `+56 ${phoneMobile}` : "No registrado"}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={async () => {
              await navigator.clipboard.writeText(`${window.location.origin}/personas/guardias/${guardiaId}`);
              toast.success("Link copiado");
            }}
          >
            <Copy className="h-3.5 w-3.5 mr-1" />
            Copiar link autogestión
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Envíos registrados</p>
        {communicationHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay envíos.</p>
        ) : (
          communicationHistory.map((event) => {
            const payload = (event.newValue || {}) as Record<string, unknown>;
            const channel = String(payload.channel || "");
            const status = String(payload.status || "");
            const templateName = String(payload.templateName || payload.templateId || "");
            return (
              <div key={event.id} className="rounded-md border border-border p-3 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm">
                  {channel === "whatsapp" ? <MessageCircle className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                  <span className="font-medium">{templateName || "Comunicación"}</span>
                  <span className="text-xs text-muted-foreground">· {status || "registrado"}</span>
                </div>
                <p className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString("es-CL")}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
