/**
 * Métricas puras del pipeline de negocios.
 * Client-safe: no importar prisma ni módulos server-only.
 */

export type AgeBucket = "ok" | "warn" | "danger";

export type DaysInStageSource = "stage_history" | "created_at";

export type StageLike = {
  id: string;
  order?: number;
  isClosedWon?: boolean | null;
  isClosedLost?: boolean | null;
  isAccepted?: boolean | null;
};

export type DealForMetrics = {
  id: string;
  stageId: string;
  createdAt: string | Date;
  probability?: number | null;
  stageHistory?: { toStageId: string; changedAt: string | Date }[] | null;
  activeQuoteSummary?: {
    amountClp?: number | null;
    amountUf?: number | null;
    totalGuards?: number | null;
  } | null;
};

export type StageSummary = {
  count: number;
  clp: number;
  uf: number;
  guards: number;
  weightedClp: number;
};

export type DealsSummary = {
  byStage: Record<string, StageSummary>;
  open: StageSummary;
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Días en la etapa actual (medianoche local). Fallback: createdAt. */
export function daysInStage(deal: DealForMetrics): {
  days: number;
  source: DaysInStageSource;
} {
  const history = deal.stageHistory ?? [];
  const entry = history.find((h) => h.toStageId === deal.stageId);
  const source: DaysInStageSource = entry ? "stage_history" : "created_at";
  const from = new Date(entry?.changedAt ?? deal.createdAt);
  const today = startOfDay(new Date());
  const origin = startOfDay(from);
  const days = Math.max(
    0,
    Math.floor((today.getTime() - origin.getTime()) / (24 * 60 * 60 * 1000)),
  );
  return { days, source };
}

export function ageBucket(days: number): AgeBucket {
  if (days <= 7) return "ok";
  if (days <= 30) return "warn";
  return "danger";
}

/**
 * Probabilidad fallback por etapa (0–100).
 * won→100, lost→0, accepted→90; resto interpola 10→90 por posición abierta.
 */
export function stageFallbackProbability(
  stage: StageLike,
  openStagesOrdered: StageLike[],
): number {
  if (stage.isClosedWon) return 100;
  if (stage.isClosedLost) return 0;
  if (stage.isAccepted) return 90;
  const n = openStagesOrdered.length;
  if (n <= 1) return 50;
  const i = openStagesOrdered.findIndex((s) => s.id === stage.id);
  if (i < 0) return 10;
  return Math.round(10 + (80 * i) / Math.max(1, n - 1));
}

/** Fracción 0–1. Usa deal.probability si > 0; si no, fallback de etapa. */
export function dealProbability(
  deal: { probability?: number | null },
  stage: StageLike,
  openStagesOrdered: StageLike[],
): number {
  const p = Number(deal.probability ?? 0);
  if (Number.isFinite(p) && p > 0) return Math.min(1, p / 100);
  return stageFallbackProbability(stage, openStagesOrdered) / 100;
}

function emptySummary(): StageSummary {
  return { count: 0, clp: 0, uf: 0, guards: 0, weightedClp: 0 };
}

export function summarizeDeals(
  deals: DealForMetrics[],
  stages: StageLike[],
): DealsSummary {
  const byId = new Map(stages.map((s) => [s.id, s]));
  const openStages = stages
    .filter((s) => !s.isClosedWon && !s.isClosedLost)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const openIds = new Set(openStages.map((s) => s.id));

  const byStage: Record<string, StageSummary> = {};
  for (const s of stages) byStage[s.id] = emptySummary();

  const open = emptySummary();

  for (const deal of deals) {
    const stage = byId.get(deal.stageId);
    if (!stage) continue;
    const bucket = byStage[deal.stageId] ?? emptySummary();
    const clp = Number(deal.activeQuoteSummary?.amountClp ?? 0) || 0;
    const uf = Number(deal.activeQuoteSummary?.amountUf ?? 0) || 0;
    const guards = Number(deal.activeQuoteSummary?.totalGuards ?? 0) || 0;
    const weighted = Math.round(clp * dealProbability(deal, stage, openStages));

    bucket.count += 1;
    bucket.clp += clp;
    bucket.uf += uf;
    bucket.guards += guards;
    bucket.weightedClp += weighted;
    byStage[deal.stageId] = bucket;

    if (openIds.has(deal.stageId)) {
      open.count += 1;
      open.clp += clp;
      open.uf += uf;
      open.guards += guards;
      open.weightedClp += weighted;
    }
  }

  return { byStage, open };
}

/** Abreviatura de montos CLP para riel/KPIs: $152,9M / $1,2MM / $840K */
export function formatClpCompact(value: number): string {
  const n = Math.abs(Number(value) || 0);
  const sign = value < 0 ? "-" : "";
  if (n >= 1_000_000_000) {
    const v = n / 1_000_000_000;
    return `${sign}$${v.toLocaleString("es-CL", { maximumFractionDigits: 1 })}MM`;
  }
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${sign}$${v.toLocaleString("es-CL", { maximumFractionDigits: 1 })}M`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return `${sign}$${v.toLocaleString("es-CL", { maximumFractionDigits: 0 })}K`;
  }
  return `${sign}$${n.toLocaleString("es-CL")}`;
}

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Valida color de etapa; si inválido, null (usar token neutro en UI). */
export function sanitizeStageColor(color: string | null | undefined): string | null {
  if (!color) return null;
  const trimmed = color.trim();
  return HEX_COLOR_RE.test(trimmed) ? trimmed : null;
}
