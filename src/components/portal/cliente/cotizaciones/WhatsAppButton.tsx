"use client";

import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBranding } from "@/lib/branding/useBranding";

interface WhatsAppButtonProps {
  variant?: "default" | "compact" | "inline" | "icon";
  context?: "prospect" | "client";
  cotizacionCode?: string;
  className?: string;
}

const FALLBACK_PHONE_RAW = "56968727644";
const FALLBACK_PHONE_DISPLAY = "+56 9 6872 7644";

export function WhatsAppButton({
  variant = "default",
  context = "client",
  cotizacionCode,
  className,
}: WhatsAppButtonProps) {
  const { branding } = useBranding();

  const message = cotizacionCode
    ? context === "prospect"
      ? `Hola, tengo una consulta sobre la propuesta ${cotizacionCode}`
      : `Hola, tengo una consulta sobre la cotización ${cotizacionCode}`
    : "Hola, tengo una consulta sobre mi servicio de seguridad";

  const phoneRaw = branding.phoneRaw?.trim() || FALLBACK_PHONE_RAW;
  const phoneDisplay = branding.phone?.trim() || FALLBACK_PHONE_DISPLAY;
  const baseLink =
    branding.whatsappLink?.trim().replace(/\?.*$/, "") || `https://wa.me/${phoneRaw}`;
  const url = `${baseLink}?text=${encodeURIComponent(message)}`;

  if (variant === "inline") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn("text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2", className)}
      >
        WhatsApp {phoneDisplay}
      </a>
    );
  }

  if (variant === "icon") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title="WhatsApp"
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors",
          className,
        )}
      >
        <MessageCircle className="w-4 h-4" />
      </a>
    );
  }

  if (variant === "compact") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex items-center gap-2 px-3 h-8 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs transition-colors",
          className,
        )}
      >
        <MessageCircle className="w-3.5 h-3.5" />
        WhatsApp
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center justify-center gap-2 w-full h-10 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-sm font-medium transition-colors",
        className,
      )}
    >
      <MessageCircle className="w-4 h-4" />
      WhatsApp {phoneDisplay}
    </a>
  );
}
