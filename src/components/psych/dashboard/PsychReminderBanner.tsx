"use client";

import { useState } from "react";
import { Clock, MessageCircle } from "lucide-react";

interface Props {
  assessmentId: string;
  targetName: string;
  phone: string;
}

/**
 * Banner que aparece en el detalle cuando el assessment lleva >24h en PENDING.
 * Ofrece regenerar token (resend) + abrir WhatsApp con el mensaje resuelto.
 */
export default function ReminderBanner({
  assessmentId,
  targetName,
  phone,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleResend() {
    setBusy(true);
    setMsg(null);
    try {
      // 1. Regenerar token (extiende expiración).
      const resR = await fetch(
        `/api/psych/assessments/${assessmentId}/resend`,
        { method: "POST" },
      );
      const resJ = await resR.json();
      if (!resR.ok || !resJ.success) {
        throw new Error(resJ.error ?? "No se pudo regenerar");
      }
      // 2. Abrir WhatsApp con plantilla resuelta.
      const sendR = await fetch(
        `/api/psych/assessments/${assessmentId}/send`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ channels: ["whatsapp"] }),
        },
      );
      const sendJ = await sendR.json();
      const r = sendJ.results?.[0];
      if (r?.ok && r.waUrl) {
        window.open(r.waUrl, "_blank", "noopener,noreferrer");
        setMsg("Link regenerado y WhatsApp abierto.");
      } else {
        setMsg(r?.reason ?? "No se pudo abrir WhatsApp.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-status-warn-border bg-status-warn-soft p-4 flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
      <Clock className="size-5 text-status-warn-fg dark:text-status-warn-fg shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-status-warn-fg">
          Sin abrir hace más de 24 horas
        </p>
        <p className="text-xs text-status-warn-fg/80">
          {targetName} · {phone}
        </p>
      </div>
      <button
        onClick={handleResend}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-status-ok text-white hover:brightness-110 disabled:opacity-50 px-3 py-2 text-sm font-medium min-h-[44px]"
      >
        <MessageCircle className="size-4" />
        {busy ? "Preparando…" : "Reenviar por WhatsApp"}
      </button>
      {msg ? (
        <p className="text-xs text-status-warn-fg ml-auto">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
