/**
 * Shared types and helpers for cotizaciones components.
 * Unified from PortalCotizaciones + PortalPropuesta types.
 */

export type CotizacionStatus = "draft" | "sent" | "approved" | "rejected";

export interface QuoteSummary {
  id: string;
  code: string;
  name: string | null;
  status: string;
  monthlyCost: number;
  validUntil: string | null;
  totalPositions: number;
  totalGuards: number;
  currency: string;
  createdAt: string;
  dealId: string | null;
  dealTitle: string | null;
  proposalLink: string | null;
}

export interface Position {
  id: string;
  customName: string | null;
  numGuards: number | null;
  numPuestos: number | null;
  startTime: string | null;
  endTime: string | null;
  weekdays: string | null;
  monthlyPositionCost: number;
  /** Precio venta asignado (cuando viene del API); usa esto para mostrar en vez de monthlyPositionCost */
  displayPrice?: number;
}

export interface AdditionalLine {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  orden: number;
  tipo?: string;
  recurrencia?: string;
  cantidad?: number;
}

export interface QuoteAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  publicUrl: string | null;
}

export interface CostByCategoryPortal {
  category: string;
  slug: string;
  type: string;
  items: Array<{ name: string; value: number }>;
  subtotal: number;
}

export interface QuoteDetail extends QuoteSummary {
  positions: Position[];
  additionalLines?: AdditionalLine[];
  attachments?: QuoteAttachment[];
  notes: string | null;
  aiDescription: string | null;
  serviceDetail: string | null;
  paymentTerms?: string;
  serviceStartDays?: number;
  contractDuration?: number;
  includedItems?: string[];
  proposalLink?: string | null;
  /** Full transparent cost breakdown for client display */
  costBreakdown?: import("@/types/cpq-breakdown").QuoteBreakdownData;
  templateSlug?: string;
  templateSections?: Record<string, boolean> | null;
  costsByCategory?: CostByCategoryPortal[];
}

export interface DealGroup {
  dealId: string;
  dealTitle: string;
  quotes: QuoteSummary[];
}

/* ── Status display config ── */

export const STATUS_BADGE: Record<string, string> = {
  draft:    "bg-zinc-800 text-zinc-400",
  sent:     "bg-blue-900/60 text-blue-300",
  approved: "bg-emerald-900/60 text-emerald-300",
  rejected: "bg-red-900/60 text-red-400",
  expired:  "bg-zinc-700 text-zinc-400",
};

export const STATUS_LABEL: Record<string, string> = {
  draft:    "Borrador",
  sent:     "Enviada",
  approved: "Aprobada",
  rejected: "Rechazada",
  expired:  "Expirada",
};

/* ── Helpers ── */

export function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-CL", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export function formatHorario(start: string | null, end: string | null): string {
  if (!start && !end) return "—";
  return `${start ?? ""}–${end ?? ""}`;
}

const FULL_WEEK = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const WEEKDAYS_ONLY = ["Lun", "Mar", "Mié", "Jue", "Vie"];
const WEEKEND_ONLY = ["Sáb", "Dom"];

export function formatWeekdays(days: string[] | string | null): string {
  if (!days) return "—";
  const arr = Array.isArray(days) ? days : [days];
  if (arr.length === 0) return "—";
  if (arr.length === 7 || FULL_WEEK.every((d) => arr.includes(d))) return "Lun-Dom";
  if (arr.length === 5 && WEEKDAYS_ONLY.every((d) => arr.includes(d))) return "Lun-Vie";
  if (arr.length === 2 && WEEKEND_ONLY.every((d) => arr.includes(d))) return "Sáb-Dom";
  if (arr.length === 6 && WEEKDAYS_ONLY.every((d) => arr.includes(d)) && arr.includes("Sáb")) return "Lun-Sáb";
  return arr.join(", ");
}

export function seemsCurrencyWrong(amount: number, currency: string): boolean {
  return (currency === "UF" && amount > 5000) || (currency === "CLP" && amount > 0 && amount < 1000);
}

export function isExpired(quote: QuoteSummary): boolean {
  if (["approved", "rejected"].includes(quote.status)) return false;
  if (!quote.validUntil) return false;
  return new Date(quote.validUntil) < new Date();
}

export function getDisplayStatus(quote: QuoteSummary): string {
  if (isExpired(quote)) return "expired";
  return quote.status;
}

export function isActionable(quote: QuoteSummary): boolean {
  return quote.status === "sent" && !isExpired(quote);
}

export function groupByDeal(quotes: QuoteSummary[]): DealGroup[] {
  const map = new Map<string, DealGroup>();
  for (const q of quotes) {
    const key = q.dealId ?? `no-deal-${q.id}`;
    const existing = map.get(key);
    if (existing) {
      existing.quotes.push(q);
    } else {
      map.set(key, {
        dealId: key,
        dealTitle: q.dealTitle ?? q.name ?? q.code,
        quotes: [q],
      });
    }
  }
  for (const group of map.values()) {
    group.quotes.sort((a, b) => {
      const aActive = a.status === "sent" ? 0 : 1;
      const bActive = b.status === "sent" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }
  return Array.from(map.values());
}
