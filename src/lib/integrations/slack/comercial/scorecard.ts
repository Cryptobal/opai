/**
 * Scorecard comercial mensual para Slack (Fase 6). Usa el MISMO servicio que el
 * dashboard (getCommercialMetrics) sobre una ventana de 6 meses: leads del mes vs
 * promedio, cotizaciones enviadas vs promedio, conversión y pipeline, con ▲/▼.
 * Se expone como `/opai metricas` (efímero) y puede reusarse en un digest mensual.
 */

import { prisma } from "@/lib/prisma";
import { getCommercialMetrics } from "@/modules/crm/analytics/commercial-metrics";
import { INTERACTION_TYPES } from "@/lib/crm/interaction-types";
import { clp } from "./deal-common";

const MONTH_LABELS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function trend(current: number, avg: number): string {
  if (avg <= 0) return "";
  if (current > avg * 1.05) return " ▲";
  if (current < avg * 0.95) return " ▼";
  return " ≈";
}

/** Volumen de interacciones del mes por tipo (Fase 7). Best-effort: "" si falla. */
async function interactionsThisMonthLine(tenantId: string, monthStart: Date): Promise<string> {
  try {
    const rows = await prisma.$queryRaw<Array<{ interaction_type: string; count: bigint }>>`
      SELECT interaction_type, COUNT(*)::bigint as count
      FROM crm.notes
      WHERE tenant_id = ${tenantId} AND interaction_type IS NOT NULL
        AND COALESCE(occurred_at, created_at) >= ${monthStart}
      GROUP BY 1
    `;
    const byType = new Map(rows.map((r) => [r.interaction_type, Number(r.count)]));
    const parts = INTERACTION_TYPES.filter((t) => t.key !== "note")
      .map((t) => ({ t, n: byType.get(t.key) ?? 0 }))
      .filter((x) => x.n > 0)
      .map((x) => `${x.t.emoji} ${x.n} ${x.t.label.toLowerCase()}${x.n === 1 ? "" : "s"}`);
    return parts.length ? parts.join(" · ") : "sin interacciones registradas";
  } catch (err) {
    console.error("[slack] scorecard interacciones falló:", err);
    return "";
  }
}

export async function buildScorecardBlocks(tenantId: string): Promise<{ text: string; blocks: unknown[] }> {
  const m = await getCommercialMetrics(tenantId, 6);
  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);
  const monthName = `${MONTH_LABELS[now.getUTCMonth()]} ${now.getUTCFullYear()}`;

  const leadsThisMonth = m.leadsByMonth.find((r) => r.month === monthKey)?.total ?? 0;
  const quotesThisMonth = m.quotesByMonth.find((r) => r.month === monthKey)?.count ?? 0;
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const interLine = await interactionsThisMonthLine(tenantId, monthStart);

  const lines = [
    `*Leads del mes:* ${leadsThisMonth} _(prom 6m: ${m.avgLeadsPerMonth})_${trend(leadsThisMonth, m.avgLeadsPerMonth)}`,
    `*Cotizaciones enviadas:* ${quotesThisMonth} _(prom 6m: ${m.avgQuotesPerMonth})_${trend(quotesThisMonth, m.avgQuotesPerMonth)}`,
    `*Conversión lead→negocio (6m):* ${m.conversion}%`,
    `*Pipeline abierto:* ${m.pipeline.openCount} negocio(s) · ${clp(m.pipeline.openAmount)}`,
    ...(interLine ? [`*Interacciones del mes:* ${interLine}`] : []),
  ];

  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: `📊 Comercial · ${monthName}`.slice(0, 150), emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
    { type: "context", elements: [{ type: "mrkdwn", text: "Promedios sobre los últimos 6 meses · OPAI" }] },
  ];
  return { text: `📊 Comercial · ${monthName}`, blocks };
}
