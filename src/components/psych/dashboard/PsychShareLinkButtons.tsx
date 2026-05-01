"use client";

import { MessageCircle, Mail, Copy, CheckCircle2 } from "lucide-react";

type Channel = "whatsapp" | "email" | "copy-link";

interface Props {
  sending: Channel | null;
  phone: string | null;
  email: string | null;
  copied: boolean;
  onSend: (ch: "whatsapp" | "email") => void;
  onCopy: () => void;
}

export function ChannelButtons({
  sending,
  phone,
  email,
  copied,
  onSend,
  onCopy,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-2">
      <button
        onClick={() => onSend("whatsapp")}
        disabled={sending !== null || !phone}
        className="w-full min-h-[44px] rounded-lg bg-status-ok text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium text-sm"
      >
        <MessageCircle className="size-4" />
        {sending === "whatsapp" ? "Abriendo…" : "WhatsApp"}
        {!phone ? <span className="text-xs">(sin teléfono)</span> : null}
      </button>
      <button
        onClick={() => onSend("email")}
        disabled={sending !== null || !email}
        className="w-full min-h-[44px] rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
      >
        <Mail className="size-4" />
        {sending === "email" ? "Enviando…" : "Email"}
        {!email ? <span className="text-xs">(sin email)</span> : null}
      </button>
      <button
        onClick={onCopy}
        className="w-full min-h-[44px] rounded-lg border border-border bg-background hover:bg-accent text-foreground/90 flex items-center justify-center gap-2 text-sm"
      >
        {copied ? (
          <CheckCircle2 className="size-4 text-status-ok-fg" />
        ) : (
          <Copy className="size-4" />
        )}
        {copied ? "Copiado" : "Copiar link"}
      </button>
    </div>
  );
}
