/**
 * Scorecard comercial mensual para Slack (Fase 6). Usa el MISMO servicio que el
 * dashboard (getCommercialMetrics) sobre una ventana de 6 meses: leads del mes vs
 * promedio, cotizaciones enviadas vs promedio, conversión y pipeline, con ▲/▼.
 * Se expone como `/opai metricas` (efímero) y puede reusarse en un digest mensual.
 */

import { getCommercialMetrics } from "@/modules/crm/analytics/commercial-metrics";
import { clp } from "./deal-common";

const MONTH_LABELS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function trend(current: number, avg: number): string {
  if (avg <= 0) return "";
  if (current > avg * 1.05) return " ▲";
  if (current < avg * 0.95) return " ▼";
  return " ≈";
}

export async function buildScorecardBlocks(tenantId: string): Promise<{ text: string; blocks: unknown[] }> {
  const m = await getCommercialMetrics(tenantId, 6);
  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);
  const monthName = `${MONTH_LABELS[now.getUTCMonth()]} ${now.getUTCFullYear()}`;

  const leadsThisMonth = m.leadsByMonth.find((r) => r.month === monthKey)?.total ?? 0;
  const quotesThisMonth = m.quotesByMonth.find((r) => r.month === monthKey)?.count ?? 0;

  const lines = [
    `*Leads del mes:* ${leadsThisMonth} _(prom 6m: ${m.avgLeadsPerMonth})_${trend(leadsThisMonth, m.avgLeadsPerMonth)}`,
    `*Cotizaciones enviadas:* ${quotesThisMonth} _(prom 6m: ${m.avgQuotesPerMonth})_${trend(quotesThisMonth, m.avgQuotesPerMonth)}`,
    `*Conversión lead→negocio (6m):* ${m.conversion}%`,
    `*Pipeline abierto:* ${m.pipeline.openCount} negocio(s) · ${clp(m.pipeline.openAmount)}`,
  ];

  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: `📊 Comercial · ${monthName}`.slice(0, 150), emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
    { type: "context", elements: [{ type: "mrkdwn", text: "Promedios sobre los últimos 6 meses · OPAI" }] },
  ];
  return { text: `📊 Comercial · ${monthName}`, blocks };
}
