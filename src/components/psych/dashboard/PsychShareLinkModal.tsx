"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { X } from "lucide-react";
import { ChannelButtons } from "./PsychShareLinkButtons";

interface Props {
  assessmentId: string;
  url: string;
  expiresAt: string;
  candidateName: string;
  phone: string | null;
  email?: string | null;
  onClose: () => void;
}

type Channel = "whatsapp" | "email" | "copy-link";

export default function PsychShareLinkModal({
  assessmentId,
  url,
  expiresAt,
  candidateName,
  phone,
  email,
  onClose,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState<Channel | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (qrRef.current) {
      QRCode.toCanvas(qrRef.current, url, { width: 140, margin: 1 }).catch(
        () => void 0,
      );
    }
  }, [url]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast("Link copiado al portapapeles");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("No se pudo copiar");
    }
  };

  const send = async (channel: "whatsapp" | "email") => {
    setSending(channel);
    try {
      const res = await fetch(`/api/psych/assessments/${assessmentId}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channels: [channel] }),
      });
      const j = await res.json();
      const r = j.results?.[0];
      if (!res.ok || !r?.ok) {
        showToast(r?.reason ?? j.error ?? "Error al enviar");
        return;
      }
      if (channel === "whatsapp" && r.waUrl) {
        showToast("Abriendo WhatsApp…");
        window.open(r.waUrl, "_blank", "noopener,noreferrer");
      } else if (channel === "email") showToast("Email enviado");
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-2xl p-5 md:p-6 max-w-md w-full shadow-xl space-y-4 max-h-[90vh] overflow-auto">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Enlace de evaluación
            </h3>
            <p className="text-sm text-muted-foreground">
              {candidateName} · Vence el{" "}
              {new Date(expiresAt).toLocaleDateString("es-CL")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex gap-3 items-center">
          <canvas ref={qrRef} className="rounded border border-border shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="rounded-lg border border-border bg-muted/40 p-2 text-[10px] break-all font-mono">
              {url}
            </div>
          </div>
        </div>

        <ChannelButtons
          sending={sending}
          phone={phone}
          email={email ?? null}
          copied={copied}
          onSend={send}
          onCopy={copy}
        />

        {toast ? (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-foreground text-background text-sm px-4 py-2 rounded-full shadow-lg">
            {toast}
          </div>
        ) : null}
      </div>
    </div>
  );
}
