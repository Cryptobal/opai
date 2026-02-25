"use client";

import { Badge } from "@/components/ui/badge";

const SOURCE_MAP: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "outline" }> = {
  web_cotizador: { label: "Cotizador Web", variant: "default" },
  web_cotizador_inteligente: { label: "Cotizador IA", variant: "success" },
  email_forward: { label: "Correo reenviado", variant: "secondary" },
};

/**
 * LeadSourceBadge — Badge estandarizado para fuentes de lead.
 * Mapea fuentes conocidas a variantes del design system.
 */
export function LeadSourceBadge({ source }: { source: string | null | undefined }) {
  if (!source) return null;
  const config = SOURCE_MAP[source];
  if (!config) {
    return <Badge variant="outline">{source}</Badge>;
  }
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
