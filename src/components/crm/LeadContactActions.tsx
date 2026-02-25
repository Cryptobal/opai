"use client";

import { Button } from "@/components/ui/button";
import { Phone, Mail, MessageSquare } from "lucide-react";

/** Normaliza teléfono para tel: (solo dígitos) */
function telHref(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return "";
  return `tel:${digits.length <= 9 ? "+56" + digits : "+" + digits}`;
}

/** URL WhatsApp Chile */
function whatsappHref(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return "";
  const withCountry =
    digits.length === 9 && digits.startsWith("9")
      ? "56" + digits
      : digits.length >= 10
        ? digits
        : "56" + digits;
  return `https://wa.me/${withCountry}`;
}

/**
 * LeadContactActions — Botones de contacto rápido (tel, email, WhatsApp).
 * Reutilizable en listado y detalle de leads.
 */
export function LeadContactActions({
  phone,
  email,
  stopPropagation = false,
}: {
  phone?: string | null;
  email?: string | null;
  /** true en links/cards donde el clic padre navega */
  stopPropagation?: boolean;
}) {
  const stop = stopPropagation
    ? (e: React.MouseEvent) => e.stopPropagation()
    : undefined;

  const hasAny = phone || email;
  if (!hasAny) return null;

  return (
    <div className="flex items-center gap-0.5">
      {phone && (
        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" asChild>
          <a href={telHref(phone)} onClick={stop} aria-label="Llamar">
            <Phone className="h-3.5 w-3.5" />
          </a>
        </Button>
      )}
      {email && (
        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" asChild>
          <a href={`mailto:${email}`} onClick={stop} aria-label="Enviar email">
            <Mail className="h-3.5 w-3.5" />
          </a>
        </Button>
      )}
      {phone && (
        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-emerald-500" asChild>
          <a
            href={whatsappHref(phone)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stop}
            aria-label="WhatsApp"
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </a>
        </Button>
      )}
    </div>
  );
}

export { telHref, whatsappHref };
