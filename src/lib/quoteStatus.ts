export type QuoteStatusKey = "draft" | "sent" | "approved" | "rejected";

export const QUOTE_STATUS: Record<QuoteStatusKey, { label: string; color: string; className: string }> = {
  draft: {
    label: "Borrador",
    color: "#f59e0b",
    className: "border-amber-500/30 text-amber-600 dark:text-amber-400",
  },
  sent: {
    label: "Enviada",
    color: "#3b82f6",
    className: "border-blue-500/30 text-blue-600 dark:text-blue-400",
  },
  approved: {
    label: "Aprobada",
    color: "#10b981",
    className: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  },
  rejected: {
    label: "Rechazada",
    color: "#ef4444",
    className: "border-red-500/30 text-red-600 dark:text-red-400",
  },
};

export function getQuoteStatus(status?: string | null) {
  const key = (status || "draft") as QuoteStatusKey;
  return QUOTE_STATUS[key] ?? QUOTE_STATUS.draft;
}
