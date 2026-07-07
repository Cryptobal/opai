"use client";

import { Phone, MessageCircle, Mail, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LeadQuickContact — 3 accesos directos de contacto (llamar / WhatsApp / email).
 * Navega al recurso y luego avisa al parent para marcar el primer contacto.
 */
export interface LeadQuickContactProps {
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  firstContactChannel: string | null;
  onChannelUsed: (ch: "phone" | "whatsapp" | "email") => void;
}

function digitsOnly(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

export function LeadQuickContact({
  phone,
  whatsapp,
  email,
  firstContactChannel,
  onChannelUsed,
}: LeadQuickContactProps) {
  const actions: {
    ch: "phone" | "whatsapp" | "email";
    label: string;
    icon: typeof Phone;
    href: string | null;
    external?: boolean;
  }[] = [
    { ch: "phone", label: "Llamar", icon: Phone, href: phone ? `tel:${digitsOnly(phone)}` : null },
    {
      ch: "whatsapp",
      label: "WhatsApp",
      icon: MessageCircle,
      href: whatsapp || phone ? `https://wa.me/${digitsOnly((whatsapp || phone) as string)}` : null,
      external: true,
    },
    { ch: "email", label: "Email", icon: Mail, href: email ? `mailto:${email}` : null },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {actions.map(({ ch, label, icon: Icon, href, external }) => {
        const used = firstContactChannel === ch;
        const disabled = !href;
        return (
          <button
            key={ch}
            type="button"
            disabled={disabled}
            aria-label={label}
            onClick={() => {
              if (!href) return;
              if (external) window.open(href, "_blank", "noopener,noreferrer");
              else window.location.href = href;
              onChannelUsed(ch);
            }}
            className={cn(
              "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border text-xs font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              disabled && "cursor-not-allowed opacity-40",
              !disabled && used
                ? "border-status-ok-border bg-status-ok-soft text-status-ok-fg"
                : "border-ds-border-default bg-ds-surface-1 text-ds-text-2 hover:bg-ds-surface-2",
            )}
          >
            {used ? <Check className="h-5 w-5" aria-hidden /> : <Icon className="h-5 w-5" aria-hidden />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
