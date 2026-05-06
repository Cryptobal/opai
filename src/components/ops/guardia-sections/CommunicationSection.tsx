"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Mail, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

type HistoryEvent = {
  id: string;
  eventType: string;
  newValue?: Record<string, unknown> | null;
  reason?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdAt: string;
};

type TemplateOption = {
  id: string;
  channel: "email" | "whatsapp";
  name: string;
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
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [commForm, setCommForm] = useState({ channel: "email", templateId: "" });

  // Cargar plantillas (email locales + whatsapp desde DocTemplate del tenant).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/personas/guardias/${guardiaId}/communications`, { cache: "no-store" });
        const json = await res.json();
        if (cancelled || !json?.success || !Array.isArray(json.data?.templates)) return;
        const list = json.data.templates as TemplateOption[];
        setTemplates(list);
        // Auto-seleccionar la primera plantilla del canal por defecto si no hay selección.
        setCommForm((prev) => {
          if (prev.templateId) return prev;
          const first = list.find((t) => t.channel === prev.channel);
          return { channel: prev.channel, templateId: first?.id ?? "" };
        });
      } catch {
        // Silencioso: el botón quedará deshabilitado por templateId vacío.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guardiaId]);

  const availableTemplates = useMemo(
    () => templates.filter((tpl) => tpl.channel === commForm.channel),
    [templates, commForm.channel]
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
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex gap-2">
          <select
            className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs"
            value={commForm.channel}
            onChange={(e) => {
              const nextChannel = e.target.value;
              const firstTemplate = templates.find((tpl) => tpl.channel === nextChannel)?.id ?? "";
              setCommForm({ channel: nextChannel, templateId: firstTemplate });
            }}
          >
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
          <select
            className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs"
            value={commForm.templateId}
            onChange={(e) => setCommForm((prev) => ({ ...prev, templateId: e.target.value }))}
          >
            {availableTemplates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
            ))}
          </select>
        </div>
        <Button size="sm" className="w-full h-8 text-xs" onClick={handleSendCommunication} disabled={sendingComm || !commForm.templateId}>
          <Send className="h-3.5 w-3.5 mr-1" />
          {sendingComm ? "Enviando..." : "Enviar"}
        </Button>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{email ? email.split("@")[0] + "@..." : "Sin email"}</span>
        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={async () => {
            await navigator.clipboard.writeText(`${window.location.origin}/personas/guardias/${guardiaId}`);
            toast.success("Link copiado");
          }}
        >
          <Copy className="h-3 w-3 inline mr-0.5" />Link
        </button>
      </div>

      {communicationHistory.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-border/40">
          <p className="text-[11px] font-medium text-muted-foreground">Últimos envíos</p>
          {communicationHistory.slice(0, 3).map((event) => {
            const payload = (event.newValue || {}) as Record<string, unknown>;
            const channel = String(payload.channel || "");
            const templateName = String(payload.templateName || payload.templateId || "");
            return (
              <div key={event.id} className="flex items-center gap-1.5 text-[11px]">
                {channel === "whatsapp" ? <MessageCircle className="h-3 w-3 shrink-0" /> : <Mail className="h-3 w-3 shrink-0" />}
                <span className="truncate">{templateName || "Comunicación"}</span>
                <span className="text-muted-foreground shrink-0 ml-auto">{new Date(event.createdAt).toLocaleDateString("es-CL")}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
