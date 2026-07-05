/**
 * Barrido de negocios estancados (Fase 5). Espeja `quote-stale.ts` pero persigue
 * NEGOCIOS: un deal abierto sin movimiento en `STALE_DAYS` (default 7, config
 * `crm.dealStaleDays`) genera una tarjeta accionable al canal comercial:
 *   😴 {Cliente} · {negocio} lleva Nd sin movimiento ({etapa})
 *   ➡️ Avanzar · 📝 Nota · 🟢 WhatsApp · ⏰ Posponer 3d · 💔 Perdido
 * Cada acción escribe un CrmHistoryLog (deal_stale_*) → no re-spamea y respeta
 * posposiciones. `sweepStaleDeals(tenantId)` lo llama el cron (uno por tenant).
 */

import { prisma } from "@/lib/prisma";
import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackPostMessage, slackRespondUrl, slackOpenView } from "../api";
import { clp, resolveDealWaUrl } from "./deal-common";
import { resolveComercialChannel } from "./quote-stale";
import { advanceView, interactionView, lostView } from "./pipeline";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_AGE_MS = 120 * DAY_MS; // no perseguir negocios demasiado viejos
const SWEEP_CAP = 100;

const pt = (t: string) => ({ type: "plain_text", text: t.slice(0, 75), emoji: true });
const daysSince = (d: Date): number => Math.max(0, Math.floor((Date.now() - d.getTime()) / DAY_MS));

/** Umbral de estancamiento (días) por tenant. Default 7. */
async function getStaleDays(tenantId: string): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { tenantId_key: { tenantId, key: "crm.dealStaleDays" } }, select: { value: true } }).catch(() => null);
  const n = s ? Number.parseInt(s.value, 10) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 365 ? n : 7;
}

/** ¿Posposición vigente o ya avisado sin re-nudge? */
async function shouldSkip(tenantId: string, dealId: string): Promise<boolean> {
  const last = await prisma.crmHistoryLog.findFirst({
    where: { tenantId, entityType: "deal", entityId: dealId, action: { in: ["deal_stale_nudged", "deal_stale_snoozed"] } },
    orderBy: { createdAt: "desc" }, select: { action: true, details: true },
  });
  if (!last) return false;
  if (last.action === "deal_stale_snoozed") {
    const until = (last.details as { until?: string } | null)?.until;
    return until ? new Date(until).getTime() > Date.now() : false;
  }
  return true;
}

interface StaleDeal { id: string; title: string; accountName: string; monto: number; stageName: string; days: number }

export function staleDealCard(d: StaleDeal, waUrl: string | null): { text: string; blocks: unknown[] } {
  const actions: unknown[] = [
    { type: "button", action_id: "dealstale_advance", value: d.id, style: "primary", text: pt("➡️ Avanzar") },
    { type: "button", action_id: "dealstale_note", value: d.id, text: pt("📝 Nota") },
  ];
  if (waUrl) actions.push({ type: "button", action_id: "dealstale_wa", url: waUrl, text: pt("🟢 WhatsApp") });
  actions.push(
    { type: "button", action_id: "dealstale_snooze", value: d.id, text: pt("⏰ Posponer 3d") },
    { type: "button", action_id: "dealstale_lost", value: d.id, style: "danger", text: pt("💔 Perdido") },
  );
  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: `😴 *${d.accountName}* · ${d.title} lleva *${d.days}d* sin movimiento (${d.stageName}${d.monto ? ` · ${clp(d.monto)}` : ""})` } },
    { type: "actions", block_id: `opai_dealstale_${d.id}`, elements: actions },
  ];
  return { text: `😴 ${d.accountName} lleva ${d.days}d sin movimiento`, blocks };
}

/** Sweep por tenant: negocios abiertos sin movimiento a los N días → tarjeta a comercial. */
export async function sweepStaleDeals(tenantId: string): Promise<{ scanned: number; nudged: number }> {
  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return { scanned: 0, nudged: 0 };
  const channelId = await resolveComercialChannel(ws);
  if (!channelId) return { scanned: 0, nudged: 0 };

  const staleDays = await getStaleDays(tenantId);
  const now = Date.now();
  const candidates = await prisma.crmDeal.findMany({
    where: { tenantId, status: "open", updatedAt: { lte: new Date(now - staleDays * DAY_MS), gte: new Date(now - MAX_AGE_MS) } },
    orderBy: { updatedAt: "asc" }, take: SWEEP_CAP,
    select: { id: true, title: true, amount: true, updatedAt: true, account: { select: { name: true } }, stage: { select: { name: true } } },
  });

  let nudged = 0;
  for (const d of candidates) {
    // Actividad real: la nota o el cambio de etapa más reciente pueden ser posteriores a updatedAt.
    const [noteMax, stageMax] = await Promise.all([
      prisma.crmNote.aggregate({ where: { tenantId, entityType: "deal", entityId: d.id }, _max: { createdAt: true } }),
      prisma.crmDealStageHistory.aggregate({ where: { tenantId, dealId: d.id }, _max: { changedAt: true } }),
    ]);
    const lastActivityMs = Math.max(d.updatedAt.getTime(), noteMax._max.createdAt?.getTime() ?? 0, stageMax._max.changedAt?.getTime() ?? 0);
    const days = daysSince(new Date(lastActivityMs));
    if (days < staleDays) continue;
    if (await shouldSkip(tenantId, d.id)) continue;

    const waUrl = await resolveDealWaUrl(tenantId, d.id).catch(() => null);
    const card = staleDealCard(
      { id: d.id, title: (d.title || "Negocio").trim() || "Negocio", accountName: (d.account?.name || "Cliente").trim() || "Cliente", monto: Number(d.amount ?? 0), stageName: d.stage?.name ?? "Sin etapa", days },
      waUrl && /^https:\/\//.test(waUrl) ? waUrl : null,
    );
    try {
      await slackPostMessage(ws.botToken, { channel: channelId, text: card.text, blocks: card.blocks });
      await prisma.crmHistoryLog.create({ data: { tenantId, entityType: "deal", entityId: d.id, action: "deal_stale_nudged", details: { via: "slack", channelId, days }, createdBy: "system" } });
      nudged++;
    } catch (e) {
      console.error(`[deal-stale] post falló para deal ${d.id}:`, e);
    }
  }
  return { scanned: candidates.length, nudged };
}

/* ── Acciones de la tarjeta ── */

export async function handleStaleDealAction(payload: {
  team?: { id?: string }; user?: { id?: string }; trigger_id?: string; response_url?: string;
  actions?: Array<{ action_id?: string; value?: string }>;
}): Promise<void> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const action = payload.actions?.[0];
  const dealId = action?.value;
  const actionId = action?.action_id;
  if (!teamId || !slackUserId || !actionId || !dealId) return;
  const ephemeral = (text: string) => (payload.response_url ? slackRespondUrl(payload.response_url, { response_type: "ephemeral", text }) : Promise.resolve());

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;
  const tenantId = workspace.tenantId;

  if (actionId === "dealstale_snooze") {
    await prisma.crmHistoryLog.create({ data: { tenantId, entityType: "deal", entityId: dealId, action: "deal_stale_snoozed", details: { until: new Date(Date.now() + 3 * DAY_MS).toISOString() }, createdBy: linked.adminId } });
    await ephemeral("⏰ Pospuesto 3 días. Te vuelvo a avisar si sigue sin movimiento.");
    return;
  }
  if (!payload.trigger_id) return;
  if (actionId === "dealstale_advance") { await slackOpenView(workspace.botToken, payload.trigger_id, await advanceView(tenantId, dealId)).catch(() => {}); return; }
  if (actionId === "dealstale_note") { await slackOpenView(workspace.botToken, payload.trigger_id, interactionView(dealId)).catch(() => {}); return; }
  if (actionId === "dealstale_lost") { await slackOpenView(workspace.botToken, payload.trigger_id, lostView(dealId)).catch(() => {}); return; }
}
