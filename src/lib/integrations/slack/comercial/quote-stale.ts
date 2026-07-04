/**
 * El loop anti-olvido (Fase 15, B5): cotización enviada sin respuesta a las 48h.
 *
 * El motor de follow-up por email (CrmFollowUpConfig + processFollowUpLog, cron
 * cada 15 min) YA está activo; esto le agrega una salida a Slack complementaria:
 * un sweep liviano que detecta cotizaciones `sent` sin vista/aceptación/rechazo
 * a las 48h y publica una tarjeta accionable a comercial:
 *   ⏳ {Cliente} lleva 48h sin responder {código}
 *   🟢 WhatsApp · ✉️ Reenviar · ⏰ Posponer 24h · 💔 Marcar perdida
 * Cada acción escribe un CrmHistoryLog (quote_stale_*) → el loop se auto-documenta
 * y no repite (respeta posposiciones).
 */

import { prisma } from "@/lib/prisma";
import { getWaTemplate } from "@/lib/whatsapp-templates";
import { getTenantForTeam, getWorkspaceForTenant, type ActiveWorkspace } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackPostMessage, slackRespondUrl, slackOpenView } from "../api";
import { normalizeWaPhone } from "./lead-actions";
import { clp } from "./deal-common";
import { lostView } from "./pipeline";

const STALE_MS = 48 * 60 * 60 * 1000;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // no perseguir cotizaciones muy viejas
const SWEEP_CAP = 100;

/** Canal comercial del tenant (ruta CPQ → categoría → default del workspace). */
export async function resolveComercialChannel(ws: ActiveWorkspace): Promise<string | null> {
  const route = await prisma.slackChannelRoute.findFirst({
    where: { tenantId: ws.tenantId, enabled: true, OR: [{ matchType: "MODULE", matchValue: "cpq" }, { matchType: "CATEGORY", matchValue: "CPQ - Cotizaciones" }] },
    select: { channelId: true },
  });
  return route?.channelId ?? ws.defaultChannelId;
}

interface StaleQuote { id: string; code: string; clientName: string; monto: number; dealId: string | null; contactFirst: string | null; contactPhone: string | null }

/** ¿Hay una posposición vigente o ya se avisó (sin re-nudge)? */
async function shouldSkip(tenantId: string, quoteId: string): Promise<boolean> {
  const last = await prisma.crmHistoryLog.findFirst({
    where: { tenantId, entityType: "quote", entityId: quoteId, action: { in: ["quote_stale_nudged", "quote_stale_snoozed", "quote_stale_resent"] } },
    orderBy: { createdAt: "desc" }, select: { action: true, details: true },
  });
  if (!last) return false; // nunca avisado → avisar
  if (last.action === "quote_stale_snoozed") {
    const until = (last.details as { until?: string } | null)?.until;
    return until ? new Date(until).getTime() > Date.now() : false; // pospuesto vigente → saltar
  }
  return true; // ya avisado/reenviado y sin posposición vencida → no spamear
}

async function resolveQuoteWa(tenantId: string, q: StaleQuote): Promise<string | null> {
  const phone = normalizeWaPhone(q.contactPhone);
  if (!phone) return null;
  const msg = await getWaTemplate(tenantId, "hub_stale", { entities: { contact: { firstName: q.contactFirst ?? "" }, account: { name: q.clientName } } }).catch(() => "");
  return `https://wa.me/${phone}?text=${encodeURIComponent((msg ?? "").trim())}`;
}

export function staleQuoteCard(q: StaleQuote, waUrl: string | null): { text: string; blocks: unknown[] } {
  const pt = (t: string) => ({ type: "plain_text", text: t.slice(0, 75), emoji: true });
  const actions: unknown[] = [];
  if (waUrl) actions.push({ type: "button", action_id: "qstale_wa", url: waUrl, style: "primary", text: pt("🟢 WhatsApp") });
  actions.push(
    { type: "button", action_id: "qstale_resend", value: q.id, text: pt("✉️ Reenviar") },
    { type: "button", action_id: "qstale_snooze", value: q.id, text: pt("⏰ Posponer 24h") },
    { type: "button", action_id: "qstale_lost", value: q.id, style: "danger", text: pt("💔 Marcar perdida") },
  );
  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: `⏳ *${q.clientName}* lleva 48h sin responder *${q.code}*${q.monto ? ` (${clp(q.monto)}/mes)` : ""}` } },
    { type: "actions", block_id: `opai_qstale_${q.id}`, elements: actions },
  ];
  return { text: `⏳ ${q.clientName} lleva 48h sin responder ${q.code}`, blocks };
}

/** Sweep: cotizaciones sent sin respuesta a las 48h → tarjeta a comercial. Lo llama el cron. */
export async function runStaleQuoteSweep(): Promise<{ scanned: number; nudged: number }> {
  const now = Date.now();
  const candidates = await prisma.cpqQuote.findMany({
    where: { status: "sent", dealId: { not: null }, updatedAt: { lte: new Date(now - STALE_MS), gte: new Date(now - MAX_AGE_MS) } },
    orderBy: { updatedAt: "asc" }, take: SWEEP_CAP,
    select: { id: true, code: true, clientName: true, tenantId: true, dealId: true, contactId: true, accountId: true, monthlyCost: true, parameters: { select: { salePriceMonthly: true } } },
  });
  let nudged = 0;
  const wsByTenant = new Map<string, ActiveWorkspace | null>();
  const chanByTenant = new Map<string, string | null>();
  for (const q of candidates) {
    // Vista del cliente → ya no está "sin responder".
    const viewed = await prisma.portalAccessLog.count({ where: { tenantId: q.tenantId, action: "view_quote", resource: q.id } });
    if (viewed > 0) continue;
    if (await shouldSkip(q.tenantId, q.id)) continue;

    if (!wsByTenant.has(q.tenantId)) {
      const ws = await getWorkspaceForTenant(q.tenantId);
      wsByTenant.set(q.tenantId, ws);
      chanByTenant.set(q.tenantId, ws ? await resolveComercialChannel(ws) : null);
    }
    const ws = wsByTenant.get(q.tenantId);
    const channelId = chanByTenant.get(q.tenantId);
    if (!ws || !channelId) continue;

    const [contact, account] = await Promise.all([
      q.contactId ? prisma.crmContact.findFirst({ where: { id: q.contactId, tenantId: q.tenantId }, select: { firstName: true, phone: true } }) : null,
      q.accountId ? prisma.crmAccount.findFirst({ where: { id: q.accountId, tenantId: q.tenantId }, select: { name: true } }) : null,
    ]);
    const sq: StaleQuote = {
      id: q.id, code: q.code, clientName: q.clientName || account?.name || "Cliente",
      monto: Number(q.parameters?.salePriceMonthly ?? 0) || Number(q.monthlyCost ?? 0),
      dealId: q.dealId, contactFirst: contact?.firstName ?? null, contactPhone: contact?.phone ?? null,
    };
    const waUrl = await resolveQuoteWa(q.tenantId, sq).catch(() => null);
    const card = staleQuoteCard(sq, waUrl);
    try {
      await slackPostMessage(ws.botToken, { channel: channelId, text: card.text, blocks: card.blocks });
      await prisma.crmHistoryLog.create({ data: { tenantId: q.tenantId, entityType: "quote", entityId: q.id, action: "quote_stale_nudged", details: { via: "slack", channelId }, createdBy: "system" } });
      nudged++;
    } catch (e) {
      console.error(`[stale-sweep] post failed for quote ${q.id}:`, e);
    }
  }
  return { scanned: candidates.length, nudged };
}

/* ── Acciones de la tarjeta ── */

export async function handleStaleQuoteAction(payload: {
  team?: { id?: string }; user?: { id?: string }; trigger_id?: string; response_url?: string;
  actions?: Array<{ action_id?: string; value?: string }>;
}): Promise<void> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const action = payload.actions?.[0];
  const quoteId = action?.value;
  const actionId = action?.action_id;
  if (!teamId || !slackUserId || !actionId || !quoteId) return;
  const responseUrl = payload.response_url;
  const ephemeral = (text: string) => (responseUrl ? slackRespondUrl(responseUrl, { response_type: "ephemeral", text }) : Promise.resolve());

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;
  const tenantId = workspace.tenantId;

  if (actionId === "qstale_snooze") {
    await prisma.crmHistoryLog.create({ data: { tenantId, entityType: "quote", entityId: quoteId, action: "quote_stale_snoozed", details: { until: new Date(Date.now() + 24 * 3600 * 1000).toISOString() }, createdBy: linked.adminId } });
    await ephemeral("⏰ Pospuesto 24h. Te vuelvo a avisar si sigue sin respuesta.");
    return;
  }
  if (actionId === "qstale_resend") {
    try {
      const { sendQuoteToPortal } = await import("@/modules/cpq/send/send-quote-to-portal");
      const res = await sendQuoteToPortal({ quoteId, tenantId, userId: linked.adminId, followUp: { include: true, targetStageId: null } });
      await prisma.crmHistoryLog.create({ data: { tenantId, entityType: "quote", entityId: quoteId, action: "quote_stale_resent", details: { via: "slack", to: res.sentTo }, createdBy: linked.adminId } });
      await ephemeral(`✉️ Cotización reenviada a ${res.sentTo}.`);
    } catch (e) {
      await ephemeral(`⚠️ No se pudo reenviar: ${e instanceof Error ? e.message : "error"}`);
    }
    return;
  }
  if (actionId === "qstale_lost") {
    const quote = await prisma.cpqQuote.findFirst({ where: { id: quoteId, tenantId }, select: { dealId: true } });
    if (!quote?.dealId) { await ephemeral("Esta cotización no tiene negocio asociado."); return; }
    if (payload.trigger_id) await slackOpenView(workspace.botToken, payload.trigger_id, lostView(quote.dealId));
    return;
  }
}
