/**
 * Hub #pipeline con board por etapa (Fase 3). Materializa el "grupo Pipeline"
 * como un canal hub con un board auto-actualizado (las secciones del sidebar no
 * son controlables por API). El board es UN mensaje fijado que se re-edita con
 * chat.update (patrón de la ficha viva) → idempotente y sin parpadeo.
 *
 * Se dispara best-effort (debounced) al abrir sala, cambiar etapa y cerrar el
 * negocio. Apagado por default (`pipelineHubEnabled`).
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForTenant, type ActiveWorkspace } from "../workspace";
import { slackCreateConversation, slackPostMessage, slackUpdateMessage, slackPinsAdd, slackListPublicChannels, SlackApiError } from "../api";
import { getDealRoomConfig, getPipelineHubState, setPipelineHubState } from "./config";

const HUB_NAME = "pipeline";
const DEBOUNCE_MS = 4000;
const lastRun = new Map<string, number>();

const fmtClp = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(n || 0));
const daysSince = (d: Date): number => Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));

/** Resuelve (o crea) el canal hub #pipeline; devuelve su id o null. */
async function ensureHubChannel(ws: ActiveWorkspace, knownId: string | null): Promise<string | null> {
  if (knownId) return knownId;
  try {
    const ch = await slackCreateConversation(ws.botToken, HUB_NAME, false);
    return ch.id;
  } catch (err) {
    if (err instanceof SlackApiError && err.slackError === "name_taken") {
      const found = (await slackListPublicChannels(ws.botToken).catch(() => [])).find((c) => c.name === HUB_NAME);
      return found?.id ?? null;
    }
    console.error("[slack] pipeline hub crear canal falló:", err);
    return null;
  }
}

/** Board de negocios OPEN (con sala) agrupados por etapa. */
async function buildBoardBlocks(tenantId: string): Promise<unknown[]> {
  const rooms = await prisma.crmDealSlackRoom.findMany({
    where: { tenantId, status: "OPEN" },
    select: { dealId: true, slackChannelId: true },
  });
  if (!rooms.length) {
    return [{ type: "section", text: { type: "mrkdwn", text: "📋 *Pipeline comercial*\n\nSin negocios abiertos con sala." } }];
  }
  const channelByDeal = new Map(rooms.map((r) => [r.dealId, r.slackChannelId]));
  const dealIds = rooms.map((r) => r.dealId);
  const [deals, lastChanges] = await Promise.all([
    prisma.crmDeal.findMany({
      where: { tenantId, id: { in: dealIds }, status: "open" },
      select: { id: true, amount: true, account: { select: { name: true } }, stage: { select: { id: true, name: true, order: true } } },
    }),
    prisma.crmDealStageHistory.groupBy({ by: ["dealId"], where: { tenantId, dealId: { in: dealIds } }, _max: { changedAt: true } }),
  ]);
  const changedAtByDeal = new Map(lastChanges.map((c) => [c.dealId, c._max.changedAt]));

  // Agrupar por etapa (order asc).
  const byStage = new Map<string, { name: string; order: number; lines: string[] }>();
  for (const d of deals) {
    const channel = channelByDeal.get(d.id);
    if (!channel || !d.stage) continue;
    const g = byStage.get(d.stage.id) ?? { name: d.stage.name, order: d.stage.order ?? 0, lines: [] };
    const changedAt = changedAtByDeal.get(d.id) ?? null;
    const days = changedAt ? daysSince(changedAt) : 0;
    const monto = Number(d.amount ?? 0);
    g.lines.push(`• <#${channel}> · ${d.account?.name ?? "Cliente"}${monto ? ` · ${fmtClp(monto)}` : ""} · ⏱ ${days}d`);
    byStage.set(d.stage.id, g);
  }

  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: `📋 *Pipeline comercial* · ${deals.length} negocio(s) abierto(s)` } },
    { type: "divider" },
  ];
  for (const g of [...byStage.values()].sort((a, b) => a.order - b.order)) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${g.name}* (${g.lines.length})\n${g.lines.join("\n").slice(0, 2900)}` } });
  }
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "Board vivo · se actualiza al abrir sala, cambiar etapa y cerrar · OPAI" }] });
  return blocks;
}

/** Publica/edita el board del hub #pipeline (idempotente). Debounced, best-effort. */
export async function refreshPipelineHub(tenantId: string): Promise<void> {
  const cfg = await getDealRoomConfig(tenantId);
  if (!cfg.pipelineHubEnabled) return;
  const now = Date.now();
  if (now - (lastRun.get(tenantId) ?? 0) < DEBOUNCE_MS) return;
  lastRun.set(tenantId, now);

  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return;
  const state = await getPipelineHubState(tenantId);
  const channelId = await ensureHubChannel(ws, state.channelId);
  if (!channelId) return;

  const text = "📋 Pipeline comercial · negocios abiertos por etapa";
  const blocks = await buildBoardBlocks(tenantId);

  if (state.ts && state.channelId === channelId) {
    try {
      await slackUpdateMessage(ws.botToken, { channel: channelId, ts: state.ts, text, blocks });
      return;
    } catch (e) {
      console.error("[slack] pipeline hub update falló, republico:", e);
    }
  }
  const { ts } = await slackPostMessage(ws.botToken, { channel: channelId, text, blocks });
  if (ts) {
    await slackPinsAdd(ws.botToken, channelId, ts).catch(() => {});
    await setPipelineHubState(tenantId, channelId, ts);
  }
}
