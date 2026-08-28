/**
 * Digest comercial semanal (Fase 15, B6): cada lunes 08:00 (y diario opcional
 * por tenant vía Setting crm.digestDaily) al canal comercial.
 *
 * El canal compartido NUNCA lleva montos CLP (solo conteos y nombres).
 * Las cifras completas salen por DM a usuarios con canView(crm, deals),
 * máximo 20, sin fallback al canal si no hay destinatarios autorizados.
 */

import { prisma } from "@/lib/prisma";
import { canView } from "@/lib/permissions";
import { resolvePermissions } from "@/lib/permissions-server";
import { getWorkspaceForTenant, type ActiveWorkspace } from "../workspace";
import { enqueueOutboxRow, trySendOutboxRow } from "../outbox";
import { slackOpenDm } from "../api";
import { getSlackUserIdForAdmin } from "../user-link";
import { clp } from "./deal-common";
import { listAdjudicados } from "./adjudicados";
import { resolveComercialChannel } from "./quote-stale";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DIGEST_DM_LIMIT = 20;

type StaleDeal = { amount: unknown; account: { name: string } | null };

function digestBlocks(opts: {
  includeAmounts: boolean;
  pipeCount: number;
  pipeSum: number;
  enviadas: number;
  ttq: string;
  vistasSinRespuesta: number;
  leadsSinTomar: number;
  staleDeals: StaleDeal[];
}): { text: string; blocks: unknown[] } {
  const staleList = opts.staleDeals.length
    ? opts.staleDeals
        .map((d) => {
          const name = d.account?.name ?? "Cliente";
          return opts.includeAmounts
            ? `• ${name} (${clp(Number(d.amount ?? 0))})`
            : `• ${name}`;
        })
        .join("\n")
    : "ninguno 🎉";

  const pipelineLine = opts.includeAmounts
    ? `*Pipeline:* ${clp(opts.pipeSum)} en ${opts.pipeCount} negocio(s)`
    : `*Pipeline:* ${opts.pipeCount} negocio(s) abiertos`;

  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: "📊 Semana comercial", emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: [
      pipelineLine,
      `*Cotizaciones enviadas (7d):* ${opts.enviadas}  ·  *time-to-quote prom:* ${opts.ttq}`,
      `*Vistas sin respuesta:* ${opts.vistasSinRespuesta}`,
      `*Leads sin tomar:* ${opts.leadsSinTomar}`,
    ].join("\n") } },
    { type: "section", text: { type: "mrkdwn", text: `*Negocios sin actividad >7d:*\n${staleList}` } },
  ];
  const text = opts.includeAmounts
    ? `📊 Semana comercial: pipeline ${clp(opts.pipeSum)} en ${opts.pipeCount} negocios · ${opts.enviadas} cotizaciones enviadas · ${opts.vistasSinRespuesta} vistas sin respuesta · ${opts.leadsSinTomar} leads sin tomar`
    : `📊 Semana comercial: ${opts.pipeCount} negocios abiertos · ${opts.enviadas} cotizaciones enviadas · ${opts.vistasSinRespuesta} vistas sin respuesta · ${opts.leadsSinTomar} leads sin tomar`;
  return { text, blocks };
}

async function postDigestDmToAuthorized(
  ws: ActiveWorkspace,
  dayKey: string,
  payload: { text: string; blocks: unknown[] },
): Promise<void> {
  const admins = await prisma.admin.findMany({
    where: { tenantId: ws.tenantId, status: "active" },
    select: { id: true, role: true, roleTemplateId: true },
    take: 80,
  });

  let sent = 0;
  for (const admin of admins) {
    if (sent >= DIGEST_DM_LIMIT) break;
    const perms = await resolvePermissions({
      role: admin.role,
      roleTemplateId: admin.roleTemplateId,
    });
    if (!canView(perms, "crm", "deals")) continue;

    const slackUserId = await getSlackUserIdForAdmin(ws, admin.id);
    if (!slackUserId) continue;
    const dm = await slackOpenDm(ws.botToken, slackUserId);
    if (!dm) continue;

    const id = await enqueueOutboxRow({
      tenantId: ws.tenantId,
      workspaceId: ws.id,
      channelId: dm,
      text: payload.text,
      blocks: payload.blocks,
      dedupeKey: `comercial-digest-dm|${ws.tenantId}|${admin.id}|${dayKey}`,
    });
    if (!id) continue;
    await trySendOutboxRow(ws.botToken, id, dm, payload.text, payload.blocks);
    sent++;
  }
}

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

  const sentIds = sentQuotes.map((q) => q.id);
  const viewed = sentIds.length
    ? await prisma.portalAccessLog.findMany({ where: { tenantId, action: "view_quote", resource: { in: sentIds } }, distinct: ["resource"], select: { resource: true } })
    : [];
  const vistasSinRespuesta = viewed.length;

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

  const metrics = {
    pipeCount: pipe._count._all,
    pipeSum: Number(pipe._sum.amount ?? 0),
    enviadas,
    ttq,
    vistasSinRespuesta,
    leadsSinTomar,
    staleDeals,
  };

  const channel = digestBlocks({ ...metrics, includeAmounts: false });
  const id = await enqueueOutboxRow({
    tenantId,
    workspaceId: ws.id,
    channelId,
    text: channel.text,
    blocks: channel.blocks,
    dedupeKey: `comercial-digest|${tenantId}|${dayKey}`,
  });
  if (!id) return false;
  await trySendOutboxRow(ws.botToken, id, channelId, channel.text, channel.blocks);

  const privatePayload = digestBlocks({ ...metrics, includeAmounts: true });
  await postDigestDmToAuthorized(ws, dayKey, privatePayload);
  return true;
}

function daysUntilStart(d: Date): number {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return Math.ceil((s.getTime() - Date.now()) / 86400000);
}

const shortDate = (d: Date): string => d.toLocaleDateString("es-CL", { day: "numeric", month: "short" });

/**
 * "La carta" de adjudicados. `includeAmounts` solo para respuesta ephemeral
 * de quien tiene canView(crm, deals). El post in_channel va sin montos.
 */
export async function buildAdjudicadosDigest(
  tenantId: string,
  opts: { includeAmounts?: boolean } = {},
): Promise<{ text: string; blocks: unknown[] }> {
  const includeAmounts = opts.includeAmounts === true;
  const deals = await listAdjudicados(tenantId);

  const header = { type: "header", text: { type: "plain_text", text: `🏁 Adjudicados por iniciar (${deals.length})`, emoji: true } };

  if (!deals.length) {
    return {
      text: "🏁 No hay proyectos adjudicados por iniciar.",
      blocks: [header, { type: "section", text: { type: "mrkdwn", text: "No hay proyectos adjudicados por iniciar. Cuando marques un negocio como adjudicado con su fecha de inicio, aparecerá aquí." } }],
    };
  }

  const lines = deals.map((d, i) => {
    const account = (d.accountName || "Cliente").trim() || "Cliente";
    const title = (d.title || "Negocio").trim() || "Negocio";
    const start = d.serviceStartDate;
    let when = "🚀 sin fecha";
    if (start) {
      const dl = daysUntilStart(start);
      const rel = dl < 0 ? `hace ${-dl}d` : dl === 0 ? "hoy" : `en ${dl}d`;
      when = `🚀 ${shortDate(start)} · ${rel}`;
    }
    const place = (d.commune || "").trim();
    const placeTxt = place ? ` · 📍 ${place}` : "";
    const amountTxt = includeAmounts ? ` · ${clp(d.amount)}` : "";
    return `${i + 1}. *${account}* · ${title} — ${when}${amountTxt}${placeTxt}`;
  });

  const blocks: unknown[] = [header];
  for (let i = 0; i < lines.length; i += 8) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: lines.slice(i, i + 8).join("\n") } });
  }
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `Ordenados por fecha de inicio · Actualizado ${new Date().toLocaleDateString("es-CL")}` }] });

  const text = `🏁 Adjudicados por iniciar (${deals.length}) — ordenados por fecha de inicio`;
  return { text, blocks };
}
