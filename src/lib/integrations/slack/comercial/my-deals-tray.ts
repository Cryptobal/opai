/**
 * Bandeja "Mis negocios" en Slack (Fase 5): `/opai negocios` (plural). Lista los
 * negocios abiertos del admin ordenados por riesgo (myDealsByRisk) con acciones
 * de pipeline por fila: ➡️ Avanzar · ➕ Interacción · 🏠 Sala · 🟢 WhatsApp.
 * (`/opai negocio` singular sigue siendo el buscador universal.)
 */

import { prisma } from "@/lib/prisma";
import { canView, canEdit } from "@/lib/permissions";
import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackUpdateView, slackPushView } from "../api";
import { modalTitle } from "../modals/title";
import { clp, resolveDealWaUrl } from "./deal-common";
import { lastInteractionLabels } from "@/lib/crm/interaction-history";
import { myDealsByRisk } from "./my-deals";
import type { ModalDef, ModalOpenContext, SlackView } from "../modals/types";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75), emoji: true });

async function openRoomsFor(tenantId: string, dealIds: string[]): Promise<Map<string, string>> {
  if (!dealIds.length) return new Map();
  const rooms = await prisma.crmDealSlackRoom.findMany({
    where: { tenantId, dealId: { in: dealIds }, status: "OPEN" },
    select: { dealId: true, slackChannelId: true },
  });
  return new Map(rooms.map((r) => [r.dealId, r.slackChannelId]));
}

const roomClientUrl = (teamId: string, channelId: string): string => `https://app.slack.com/client/${teamId}/${channelId}`;

async function renderMyDeals(tenantId: string, adminId: string, teamId: string, canWrite: boolean, notice?: string): Promise<SlackView> {
  const deals = await myDealsByRisk(tenantId, adminId, 15);
  const [waPairs, rooms, interactions] = await Promise.all([
    Promise.all(deals.map(async (d) => [d.id, await resolveDealWaUrl(tenantId, d.id).catch(() => null)] as const)),
    openRoomsFor(tenantId, deals.map((d) => d.id)),
    lastInteractionLabels(tenantId, "deal", deals.map((d) => d.id)),
  ]);
  const waById = new Map(waPairs);

  const blocks: unknown[] = [];
  if (notice) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: notice }] });
  if (!deals.length) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "No tienes negocios abiertos a tu nombre. 🎉" } });
  } else {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "Tus negocios abiertos, ordenados por riesgo de enfriarse." }] }, { type: "divider" });
    for (const d of deals) {
      const roomChannel = rooms.get(d.id) ?? null;
      const li = interactions.get(d.id);
      const line = `${roomChannel ? "🏠 " : ""}*${d.accountName}* · ${d.title}\n${clp(d.amount)} · ${d.stageName} · ⏱ ${d.daysInactive}d sin actividad${li ? `\n_última interacción: ${li}_` : ""}`;
      blocks.push({ type: "section", text: { type: "mrkdwn", text: line } });
      const btns: unknown[] = [];
      if (canWrite) btns.push({ type: "button", action_id: "mydeals_advance", value: d.id, text: pt("➡️ Avanzar") });
      if (canWrite) btns.push({ type: "button", action_id: "mydeals_interaction", value: d.id, text: pt("➕ Interacción") });
      if (roomChannel) btns.push({ type: "button", action_id: "mydeals_roomlink", url: roomClientUrl(teamId, roomChannel), text: pt("🏠 Sala") });
      else if (canWrite) btns.push({ type: "button", action_id: "mydeals_room", value: d.id, text: pt("🏠 Abrir sala") });
      const wa = waById.get(d.id);
      if (wa && /^https:\/\//.test(wa)) btns.push({ type: "button", action_id: "mydeals_wa", url: wa, text: pt("🟢 WhatsApp") });
      if (btns.length) blocks.push({ type: "actions", block_id: `mydeals_${d.id}`, elements: btns });
    }
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `${deals.length} negocio(s) · máx 15` }] });
  }

  return { type: "modal", callback_id: "opai_mis_negocios", title: modalTitle("Mis negocios"), close: pt("Cerrar"), blocks };
}

export async function handleMyDealsAction(payload: {
  team?: { id?: string }; user?: { id?: string }; trigger_id?: string;
  view?: { id?: string };
  actions?: Array<{ action_id?: string; value?: string }>;
}): Promise<void> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const action = payload.actions?.[0];
  if (!teamId || !slackUserId || !action?.action_id) return;
  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked || !canView(linked.perms, "crm", "deals")) return;
  const tenantId = workspace.tenantId;
  const canWrite = canEdit(linked.perms, "crm", "deals");
  const dealId = action.value;

  if (action.action_id === "mydeals_advance" && dealId && canWrite && payload.trigger_id) {
    const { advanceView } = await import("./pipeline");
    await slackPushView(workspace.botToken, payload.trigger_id, await advanceView(tenantId, dealId)).catch(() => {});
    return;
  }
  if (action.action_id === "mydeals_interaction" && dealId && canWrite && payload.trigger_id) {
    const { interactionView } = await import("./pipeline");
    await slackPushView(workspace.botToken, payload.trigger_id, interactionView(dealId)).catch(() => {});
    return;
  }
  if (action.action_id === "mydeals_room" && dealId && canWrite && payload.view?.id) {
    const { openDealRoom } = await import("../deal-rooms/room");
    const r = await openDealRoom(tenantId, dealId, linked.adminId);
    const notice = r.ok ? (r.alreadyExisted ? `🏠 La sala ya existe: <#${r.channelId}>` : `🏠 Sala abierta: <#${r.channelId}>.`) : `⚠️ ${r.error ?? "No se pudo abrir la sala."}`;
    await slackUpdateView(workspace.botToken, payload.view.id, await renderMyDeals(tenantId, linked.adminId, teamId, canWrite, notice)).catch(() => {});
    return;
  }
}

export const myDealsModal: ModalDef = {
  callbackId: "opai_mis_negocios",
  title: "Mis negocios",
  requires: (perms) => canView(perms, "crm", "deals"),
  requiresMessage: "Necesitas acceso a Negocios (CRM).",
  build: (ctx: ModalOpenContext) => renderMyDeals(ctx.tenantId, ctx.linked.adminId, ctx.workspace.slackTeamId, canEdit(ctx.linked.perms, "crm", "deals")),
  submit: async () => ({ ack: {} }),
};
