"use client";

import { useEffect, useState } from "react";
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

/** Resuelve qué slug usar según props. */
function pickSlug(context: "prospect" | "client", cotizacionCode?: string): string {
  if (!cotizacionCode) return "portal_consult_general";
  return context === "prospect" ? "portal_consult_proposal" : "portal_consult_quote";
}

/**
 * Mensaje fallback (mismo texto que el hardcoded actual). Se usa antes
 * de que el endpoint de resolución del tenant cargue, y como red de
 * seguridad si falla la llamada.
 */
function fallbackMessage(context: "prospect" | "client", cotizacionCode?: string): string {
  if (cotizacionCode) {
    return context === "prospect"
      ? `Hola, tengo una consulta sobre la propuesta ${cotizacionCode}`
      : `Hola, tengo una consulta sobre la cotización ${cotizacionCode}`;
  }
  return "Hola, tengo una consulta sobre mi servicio de seguridad";
}

export function WhatsAppButton({
  variant = "default",
  context = "client",
  cotizacionCode,
  className,
}: WhatsAppButtonProps) {
  const { branding } = useBranding();

  const phoneRaw = branding.phoneRaw?.trim() || FALLBACK_PHONE_RAW;
  const phoneDisplay = branding.phone?.trim() || FALLBACK_PHONE_DISPLAY;

  // Estado inicial = URL armada con el fallback. Esto garantiza que el
  // botón sea funcional incluso antes de que la plantilla cargue.
  const [resolvedUrl, setResolvedUrl] = useState<string>(() => {
    const message = fallbackMessage(context, cotizacionCode);
    const baseLink =
      branding.whatsappLink?.trim().replace(/\?.*$/, "") || `https://wa.me/${phoneRaw}`;
    return `${baseLink}?text=${encodeURIComponent(message)}`;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/portal/cliente/whatsapp/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: pickSlug(context, cotizacionCode),
            quoteCode: cotizacionCode,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.success || !data?.data?.url) return;
        setResolvedUrl(data.data.url);
      } catch {
        // Mantener fallback ya seteado.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [context, cotizacionCode]);

  const url = resolvedUrl;

  if (variant === "inline") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn("text-xs text-status-ok-fg hover:text-status-ok-fg underline underline-offset-2", className)}
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
          "flex items-center justify-center w-10 h-10 rounded-lg border border-status-ok-border text-status-ok-fg hover:bg-status-ok-soft transition-colors",
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
          "flex items-center gap-2 px-3 h-8 rounded-lg border border-status-ok-border text-status-ok-fg hover:bg-status-ok-soft text-xs transition-colors",
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
        "flex items-center justify-center gap-2 w-full h-10 rounded-lg border border-status-ok-border text-status-ok-fg hover:bg-status-ok-soft text-sm font-medium transition-colors",
        className,
      )}
    >
      <MessageCircle className="w-4 h-4" />
      WhatsApp {phoneDisplay}
    </a>
  );
}
