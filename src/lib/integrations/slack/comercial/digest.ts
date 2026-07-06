/**
 * Digest comercial semanal (Fase 15, B6): cada lunes 08:00 (y diario opcional
 * por tenant vía Setting crm.digestDaily) al canal comercial:
 *   📊 Semana comercial: pipeline $X en N negocios · M cotizaciones enviadas
 *   (time-to-quote prom: Xh) · K vistas sin respuesta · J leads sin tomar ·
 *   negocios sin actividad >7d: [lista corta]
 * Todo calculado de timestamps existentes (cero campos nuevos).
 */

import { prisma } from "@/lib/prisma";
import { getWorkspaceForTenant } from "../workspace";
import { enqueueOutboxRow, trySendOutboxRow } from "../outbox";
import { clp } from "./deal-common";
import { resolveComercialChannel } from "./quote-stale";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Calcula las métricas de la semana y postea la tarjeta (idempotente por día). */
export async function buildAndPostDigest(tenantId: string, dayKey: string): Promise<boolean> {
  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return false;
  const channelId = await resolveComercialChannel(ws);
  if (!channelId) return false;

  const weekAgo = new Date(Date.now() - WEEK_MS);
  const [pipe, leadsSinTomar, enviadas, sentQuotes, staleDeals, leadQuotes] = await Promise.all([
    prisma.crmDeal.aggregate({ where: { tenantId, status: "open" }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.crmLead.count({ where: { tenantId, status: { in: ["pending", "in_review"] }, firstContactAt: null } }),
    prisma.crmHistoryLog.count({ where: { tenantId, action: "quote_sent_portal", createdAt: { gte: weekAgo } } }),
    prisma.cpqQuote.findMany({ where: { tenantId, status: "sent" }, select: { id: true } }),
    prisma.crmDeal.findMany({ where: { tenantId, status: "open", updatedAt: { lt: weekAgo } }, orderBy: { amount: "desc" }, take: 5, select: { id: true, amount: true, account: { select: { name: true } } } }),
    prisma.cpqQuote.findMany({ where: { tenantId, createdFromLeadId: { not: null }, createdAt: { gte: weekAgo } }, select: { createdAt: true, createdFromLeadId: true } }),
  ]);

  // Vistas sin respuesta: cotizaciones sent que el cliente YA abrió.
  const sentIds = sentQuotes.map((q) => q.id);
  const viewed = sentIds.length
    ? await prisma.portalAccessLog.findMany({ where: { tenantId, action: "view_quote", resource: { in: sentIds } }, distinct: ["resource"], select: { resource: true } })
    : [];
  const vistasSinRespuesta = viewed.length;

  // Time-to-quote promedio (lead.createdAt → quote.createdAt) de la semana.
  let ttq = "—";
  if (leadQuotes.length) {
    const leadIds = [...new Set(leadQuotes.map((q) => q.createdFromLeadId!).filter(Boolean))];
    const leads = await prisma.crmLead.findMany({ where: { id: { in: leadIds } }, select: { id: true, createdAt: true } });
    const lm = new Map(leads.map((l) => [l.id, l.createdAt]));
    const diffs = leadQuotes
      .map((q) => { const lc = lm.get(q.createdFromLeadId!); return lc ? q.createdAt.getTime() - lc.getTime() : null; })
      .filter((x): x is number => x != null && x >= 0);
    if (diffs.length) ttq = `${(diffs.reduce((a, b) => a + b, 0) / diffs.length / 3.6e6).toFixed(1)}h`;
  }

  const pipeSum = Number(pipe._sum.amount ?? 0);
  const staleList = staleDeals.length
    ? staleDeals.map((d) => `• ${d.account?.name ?? "Cliente"} (${clp(Number(d.amount ?? 0))})`).join("\n")
    : "ninguno 🎉";

  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: "📊 Semana comercial", emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: [
      `*Pipeline:* ${clp(pipeSum)} en ${pipe._count._all} negocio(s)`,
      `*Cotizaciones enviadas (7d):* ${enviadas}  ·  *time-to-quote prom:* ${ttq}`,
      `*Vistas sin respuesta:* ${vistasSinRespuesta}`,
      `*Leads sin tomar:* ${leadsSinTomar}`,
    ].join("\n") } },
    { type: "section", text: { type: "mrkdwn", text: `*Negocios sin actividad >7d:*\n${staleList}` } },
  ];
  const text = `📊 Semana comercial: pipeline ${clp(pipeSum)} en ${pipe._count._all} negocios · ${enviadas} cotizaciones enviadas · ${vistasSinRespuesta} vistas sin respuesta · ${leadsSinTomar} leads sin tomar`;

  // Idempotencia por (tenant, día): el dedupe del outbox evita doble envío.
  const id = await enqueueOutboxRow({ tenantId, workspaceId: ws.id, channelId, text, blocks, dedupeKey: `comercial-digest|${tenantId}|${dayKey}` });
  if (!id) return false; // ya enviado hoy
  await trySendOutboxRow(ws.botToken, id, channelId, text, blocks);
  return true;
}

/** Días hasta el inicio del servicio (a medianoche local); negativo = ya arrancó. */
function daysUntilStart(d: Date): number {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return Math.ceil((s.getTime() - Date.now()) / 86400000);
}

const shortDate = (d: Date): string => d.toLocaleDateString("es-CL", { day: "numeric", month: "short" });

/**
 * "La carta" de adjudicados: mensaje compartible con el equipo con todos los
 * proyectos adjudicados por iniciar (etapas `isAccepted`) ordenados por fecha de
 * inicio del servicio. Mismo criterio que el Hub (`getUpcomingProjects`) y la
 * vista de pipeline en Slack. No postea: devuelve `{ text, blocks }` para que el
 * caller decida el canal (aquí lo comparte in_channel desde `/opai adjudicados`).
 */
export async function buildAdjudicadosDigest(tenantId: string): Promise<{ text: string; blocks: unknown[] }> {
  const acceptedStages = await prisma.crmPipelineStage.findMany({
    where: { tenantId, isActive: true, isAccepted: true }, select: { id: true },
  });
  const deals = acceptedStages.length
    ? await prisma.crmDeal.findMany({
        where: { tenantId, stageId: { in: acceptedStages.map((s) => s.id) } },
        orderBy: [{ serviceStartDate: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
        take: 25,
        select: { id: true, title: true, amount: true, serviceStartDate: true, commune: true, city: true, account: { select: { name: true } } },
      })
    : [];

  const header = { type: "header", text: { type: "plain_text", text: `🏁 Adjudicados por iniciar (${deals.length})`, emoji: true } };

  if (!deals.length) {
    return {
      text: "🏁 No hay proyectos adjudicados por iniciar.",
      blocks: [header, { type: "section", text: { type: "mrkdwn", text: "No hay proyectos adjudicados por iniciar. Cuando marques un negocio como adjudicado con su fecha de inicio, aparecerá aquí." } }],
    };
  }

  const lines = deals.map((d, i) => {
    const account = (d.account?.name || "Cliente").trim() || "Cliente";
    const title = (d.title || "Negocio").trim() || "Negocio";
    const start = d.serviceStartDate;
    let when = "🚀 sin fecha";
    if (start) {
      const dl = daysUntilStart(start);
      const rel = dl < 0 ? `hace ${-dl}d` : dl === 0 ? "hoy" : `en ${dl}d`;
      when = `🚀 ${shortDate(start)} · ${rel}`;
    }
    const place = (d.commune || d.city || "").trim();
    const placeTxt = place ? ` · 📍 ${place}` : "";
    return `${i + 1}. *${account}* · ${title} — ${when} · ${clp(Number(d.amount ?? 0))}${placeTxt}`;
  });

  // Slack limita cada section text a 3000 chars → troceamos en bloques de 8.
  const blocks: unknown[] = [header];
  for (let i = 0; i < lines.length; i += 8) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: lines.slice(i, i + 8).join("\n") } });
  }
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `Ordenados por fecha de inicio · Actualizado ${new Date().toLocaleDateString("es-CL")}` }] });

  const text = `🏁 Adjudicados por iniciar (${deals.length}) — ordenados por fecha de inicio`;
  return { text, blocks };
}
