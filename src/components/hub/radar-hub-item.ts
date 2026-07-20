/** DTO y helpers de presentación de los RadarItems en el hub. */

export type RadarItemDTO = {
  id: string;
  kind: string;
  status: string;
  title: string;
  summary: string | null;
  threadId: string | null;
  dealId: string | null;
  accountId: string | null;
  dueAt: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

/** Ícono (emoji) por tipo de item. */
export function kindIcon(kind: string): string {
  switch (kind) {
    case "nuevo_lead":
      return "📡";
    case "senal_compra":
      return "🔥";
    case "compromiso":
      return "⏰";
    case "brief":
      return "📋";
    default:
      return "✦";
  }
}

function scopeHref(item: RadarItemDTO): string {
  if (item.dealId) return `/crm/deals/${item.dealId}`;
  if (item.accountId) return `/crm/accounts/${item.accountId}`;
  return "/crm";
}

/** CTA contextual (etiqueta + destino) por tipo de item. */
export function ctaFor(item: RadarItemDTO): { label: string; href: string } {
  switch (item.kind) {
    case "nuevo_lead":
      return { label: "Crear lead", href: `/crm/correos?thread=${item.threadId}&extract=1` };
    case "senal_compra":
      return { label: "Abrir negocio", href: scopeHref(item) };
    case "compromiso":
      return {
        label: "Ver follow-up",
        href: item.threadId ? `/crm/correos?thread=${item.threadId}` : scopeHref(item),
      };
    case "brief":
      return { label: "Ver brief", href: scopeHref(item) };
    default:
      return { label: "Ver", href: scopeHref(item) };
  }
}
