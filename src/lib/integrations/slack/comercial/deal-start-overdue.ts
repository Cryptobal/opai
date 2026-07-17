/**
 * Alertas Slack para adjudicados cuya fecha de inicio ya pasó: tarjeta accionable
 * al canal comercial con opciones de actualizar fecha o pasar a Activo.
 */

import { prisma } from "@/lib/prisma";
import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackPostMessage, slackRespondUrl } from "../api";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { acceptedStageIds } from "./adjudicados";
import { clp, markDealWon } from "./deal-common";
import { resolveComercialChannel } from "./quote-stale";
import { openStartDateModal } from "./deal-start-date";

const DAY_MS = 24 * 60 * 60 * 1000;
const SWEEP_CAP = 50;
const pt = (t: string) => ({ type: "plain_text", text: t.slice(0, 75), emoji: true });

function todayChileYmd(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

function daysOverdue(start: Date): number {
  const today = todayChileYmd();
  const startYmd = start.toISOString().slice(0, 10);
  const a = Date.parse(`${today}T12:00:00Z`);
  const b = Date.parse(`${startYmd}T12:00:00Z`);
  return Math.max(0, Math.round((a - b) / DAY_MS));
}

async function shouldSkip(tenantId: string, dealId: string): Promise<boolean> {
  const last = await prisma.crmHistoryLog.findFirst({
    where: { tenantId, entityType: "deal", entityId: dealId, action: { in: ["deal_start_overdue_nudged", "deal_start_overdue_snoozed"] } },
    orderBy: { createdAt: "desc" },
    select: { action: true, details: true },
  });
  if (!last) return false;
  if (last.action === "deal_start_overdue_snoozed") {
    const until = (last.details as { until?: string } | null)?.until;
    return until ? new Date(until).getTime() > Date.now() : false;
  }
  return true;
}

interface OverdueDeal {
  id: string;
  title: string;
  accountName: string;
  amount: number;
  serviceStartDate: Date;
  days: number;
}

export function overdueStartCard(d: OverdueDeal): { text: string; blocks: unknown[] } {
  const url = `${getCanonicalSiteUrl()}/crm/deals/${d.id}`;
  const blocks: unknown[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🔴 *${d.accountName}* · ${d.title}\nLa fecha de inicio (*${d.serviceStartDate.toISOString().slice(0, 10)}*) pasó hace *${d.days}d*. Actualiza la fecha o pasa el negocio a *Activo*.${d.amount ? ` · ${clp(d.amount)}` : ""}`,
      },
    },
    {
      type: "actions",
      block_id: `opai_dealstart_${d.id}`,
      elements: [
        { type: "button", action_id: "dealstart_date", value: d.id, style: "primary", text: pt("📅 Actualizar fecha") },
        { type: "button", action_id: "dealstart_active", value: d.id, text: pt("✅ Pasar a Activo") },
        { type: "button", action_id: "dealstart_open", url, text: pt("🔗 OPAI") },
        { type: "button", action_id: "dealstart_snooze", value: d.id, text: pt("⏰ Posponer 3d") },
      ],
    },
  ];
  return { text: `🔴 ${d.accountName}: fecha de inicio vencida (${d.days}d)`, blocks };
}

export async function sweepOverdueStartDates(tenantId: string): Promise<{ scanned: number; nudged: number }> {
  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return { scanned: 0, nudged: 0 };
  const channelId = await resolveComercialChannel(ws);
  if (!channelId) return { scanned: 0, nudged: 0 };

  const stageIds = await acceptedStageIds(tenantId);
  if (!stageIds.length) return { scanned: 0, nudged: 0 };

  const cutoff = new Date(`${todayChileYmd()}T12:00:00Z`);
  const rows = await prisma.crmDeal.findMany({
    where: { tenantId, stageId: { in: stageIds }, serviceStartDate: { lt: cutoff } },
    orderBy: { serviceStartDate: "asc" },
    take: SWEEP_CAP,
    select: { id: true, title: true, amount: true, serviceStartDate: true, account: { select: { name: true } } },
  });

  let nudged = 0;
  for (const d of rows) {
    if (!d.serviceStartDate) continue;
    if (await shouldSkip(tenantId, d.id)) continue;
    const card = overdueStartCard({
      id: d.id,
      title: (d.title || "Negocio").trim() || "Negocio",
      accountName: (d.account?.name || "Cliente").trim() || "Cliente",
      amount: Number(d.amount ?? 0),
      serviceStartDate: d.serviceStartDate,
      days: daysOverdue(d.serviceStartDate),
    });
    try {
      await slackPostMessage(ws.botToken, { channel: channelId, text: card.text, blocks: card.blocks });
      await prisma.crmHistoryLog.create({
        data: {
          tenantId, entityType: "deal", entityId: d.id, action: "deal_start_overdue_nudged",
          details: { via: "slack", channelId, days: daysOverdue(d.serviceStartDate) },
          createdBy: "system",
        },
      });
      nudged++;
    } catch (e) {
      console.error(`[deal-start-overdue] post falló deal ${d.id}:`, e);
    }
  }
  return { scanned: rows.length, nudged };
}

export async function handleOverdueStartAction(payload: {
  team?: { id?: string }; user?: { id?: string }; trigger_id?: string; response_url?: string;
  actions?: Array<{ action_id?: string; value?: string }>;
}): Promise<void> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const action = payload.actions?.[0];
  const dealId = action?.value;
  const actionId = action?.action_id;
  if (!teamId || !slackUserId || !actionId || !dealId) return;

  const ephemeral = (text: string) =>
    payload.response_url ? slackRespondUrl(payload.response_url, { response_type: "ephemeral", text }) : Promise.resolve();

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;
  const tenantId = workspace.tenantId;

  if (actionId === "dealstart_snooze") {
    await prisma.crmHistoryLog.create({
      data: {
        tenantId, entityType: "deal", entityId: dealId, action: "deal_start_overdue_snoozed",
        details: { until: new Date(Date.now() + 3 * DAY_MS).toISOString() },
        createdBy: linked.adminId,
      },
    });
    await ephemeral("⏰ Alerta pospuesta 3 días.");
    return;
  }
  if (actionId === "dealstart_active") {
    const r = await markDealWon(tenantId, linked.adminId, dealId);
    await ephemeral(r.ok ? "✅ Negocio pasado a Activo (sincronizado con OPAI)." : `⚠️ ${r.error ?? "No se pudo mover."}`);
    return;
  }
  if (actionId === "dealstart_date" && payload.trigger_id) {
    await openStartDateModal(workspace.botToken, payload.trigger_id, tenantId, dealId, false);
  }
}
