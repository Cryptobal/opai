export type QuoteStatusKey = "draft" | "sent" | "approved" | "rejected";

export const QUOTE_STATUS: Record<QuoteStatusKey, { label: string; color: string; className: string }> = {
  draft: {
    label: "Borrador",
    color: "#f59e0b",
    className: "border-status-warn-border text-status-warn-fg dark:text-status-warn-fg",
  },
  sent: {
    label: "Enviada",
    color: "#3b82f6",
    className: "border-status-info-border text-status-info-fg dark:text-status-info-fg",
  },
  approved: {
    label: "Aprobada",
    color: "#10b981",
    className: "border-status-ok-border text-status-ok-fg dark:text-status-ok-fg",
  },
  rejected: {
    label: "Rechazada",
    color: "#ef4444",
    className: "border-status-danger-border text-status-danger-fg dark:text-status-danger-fg",
  },
};

export function getQuoteStatus(status?: string | null) {
  const key = (status || "draft") as QuoteStatusKey;
  return QUOTE_STATUS[key] ?? QUOTE_STATUS.draft;
}
