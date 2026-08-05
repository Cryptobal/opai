import type { CrmDeal, CrmPipelineStage } from "@/types";

export type DealsFocusLabel =
  | "all"
  | "proposals-sent-30d"
  | "won-after-proposal-30d"
  | "followup-open"
  | "followup-overdue";

export function getDealsFocusLabel(focus: DealsFocusLabel): string | null {
  if (focus === "proposals-sent-30d") return "Mostrando propuestas enviadas en los últimos 30 días";
  if (focus === "won-after-proposal-30d") return "Mostrando negocios ganados tras propuesta en 30 días";
  if (focus === "followup-open") return "Mostrando negocios abiertos en seguimiento";
  if (focus === "followup-overdue") return "Mostrando negocios con seguimientos vencidos";
  return null;
}

export function isOpenStage(stage: CrmPipelineStage): boolean {
  return !stage.isClosedWon && !stage.isClosedLost;
}

export function shortStageName(name: string): string {
  const map: Record<string, string> = {
    "Cotización enviada": "Cotización",
    "Primer seguimiento": "1er seg.",
    "Segundo seguimiento": "2º seg.",
  };
  return map[name] ?? name;
}

export function getDealCommercialIndicators(deal: CrmDeal): {
  amountClp: number;
  amountUf: number;
  totalGuards: number;
} {
  const amountClp = Number(deal.activeQuoteSummary?.amountClp ?? 0);
  const amountUf = Number(deal.activeQuoteSummary?.amountUf ?? 0);
  const totalGuards = Number(deal.activeQuoteSummary?.totalGuards ?? 0);
  return {
    amountClp: Number.isFinite(amountClp) ? amountClp : 0,
    amountUf: Number.isFinite(amountUf) ? amountUf : 0,
    totalGuards: Number.isFinite(totalGuards) ? totalGuards : 0,
  };
}

export function getDealFollowUpIndicator(deal: CrmDeal): {
  label: string;
  dateLabel: string;
  overdue: boolean;
} | null {
  const next = deal.followUpLogs?.[0];
  if (!next) return null;
  const dueTime = new Date(next.scheduledAt).getTime();
  const now = Date.now();
  const d = new Date(next.scheduledAt);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const dateLabel = `${d.getDate()} ${months[d.getMonth()]}`;
  if (dueTime <= now) {
    return { label: `S${next.sequence} vencido`, dateLabel, overdue: true };
  }
  if (dueTime - now <= 24 * 60 * 60 * 1000) {
    return { label: `S${next.sequence} hoy`, dateLabel, overdue: false };
  }
  return { label: `S${next.sequence}`, dateLabel, overdue: false };
}
