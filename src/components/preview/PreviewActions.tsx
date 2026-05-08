"use client";

import { useState } from "react";
import { toast } from "sonner";

export function PreviewActions(props: {
  sessionId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  draftPresentationId?: string | null;
}) {
  const [sending, setSending] = useState(false);

  async function handleSend() {
    setSending(true);
    try {
      const res = await fetch("/api/presentations/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: props.sessionId,
          recipientEmail: props.contactEmail,
          recipientName: props.contactName,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof json?.error === "string" ? json.error : "No se pudo enviar");
        return;
      }
      toast.success("Correo de presentación enviado");
    } catch {
      toast.error("Error de red al enviar");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-6 left-0 right-0 z-40 flex flex-wrap items-center justify-center gap-2 px-4">
      <button
        type="button"
        onClick={handleSend}
        disabled={sending || !props.contactEmail}
        className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-50 ds-tap"
      >
        {sending ? "Enviando…" : "Enviar al cliente"}
      </button>
      <span className="text-xs text-white/50">
        {props.companyName}
        {props.draftPresentationId ? ` · borrador ${props.draftPresentationId.slice(0, 8)}…` : null}
      </span>
    </div>
  );
}
