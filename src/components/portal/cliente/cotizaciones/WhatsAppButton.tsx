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

/** Resuelve qué slug usar según props. */
function pickSlug(context: "prospect" | "client", cotizacionCode?: string): string {
  if (!cotizacionCode) return "portal_consult_general";
  return context === "prospect" ? "portal_consult_proposal" : "portal_consult_quote";
}

/**
 * Botón WhatsApp del portal cliente.
 *
 * Fail-loud: si el tenant NO tiene `phoneRaw` ni `whatsappLink` configurados
 * en su branding, este botón retorna `null` (no se renderiza). PR5 eliminó
 * el fallback hardcoded a Gard (`56968727644`) — antes el botón siempre
 * aparecía y al click caía al teléfono de Gard, lo que en multi-tenant es
 * un bug grave.
 *
 * Mientras carga la URL del template del tenant, el botón también se mantiene
 * oculto (no hay fallback con mensaje genérico) — solo se renderiza cuando
 * llega la URL resuelta desde la plantilla del tenant.
 */
export function WhatsAppButton({
  variant = "default",
  context = "client",
  cotizacionCode,
  className,
}: WhatsAppButtonProps) {
  const { branding } = useBranding();
  const phoneRaw = branding.phoneRaw?.trim() || "";
  const phoneDisplay = branding.phone?.trim() || "";

  // Si el tenant no tiene WhatsApp configurado, no renderizar el botón.
  // NO caemos al fallback de otro tenant.
  const tenantHasWhatsApp =
    phoneRaw.length > 0 || (branding.whatsappLink?.trim().length ?? 0) > 0;

  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantHasWhatsApp) return;
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
        // Sin url resuelta = no renderizar botón (fail-loud).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [context, cotizacionCode, tenantHasWhatsApp]);

  if (!tenantHasWhatsApp || !resolvedUrl) {
    return null;
  }

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
