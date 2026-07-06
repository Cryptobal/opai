/**
 * Sincronía de etapa → sala del negocio (Fase 3). Cada movimiento vivo del
 * negocio refleja su etapa en la sala SIN ruido:
 *   1. refresca la ficha viva (fuente de verdad detallada),
 *   2. escribe el topic ("{macro} Etapa: {nombre} · {monto} · {días}d"),
 *   3. ajusta el nombre del canal según `channelNaming`:
 *        · emoji       → prefijo por macro-fase (neg/activo/cierre): renombra
 *                        SOLO al cruzar de macro-fase (bajo churn, rate-limit-safe),
 *        · stagePrefix → prefijo por etapa ({etapa}-{slug}): renombra por etapa,
 *        · stable      → nunca toca el nombre.
 * Best-effort: sin sala OPEN o sin workspace, no hace nada.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForTenant } from "../workspace";
import { slackSetTopic, slackRenameConversation } from "../api";
import { getOpenDealRoom, refreshDealRoomFicha, dealRoomChannelName, slackSlug } from "./room";
import { getDealRoomConfig } from "./config";
import { stageMacroPhase, type MacroPhaseKey } from "./stage-phase";

/** Token ascii del nombre por macro-fase (Slack no admite emoji en nombres). */
const MACRO_TOKEN: Record<MacroPhaseKey, string> = { early: "neg", mid: "activo", late: "cierre" };

const fmtClp = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(n || 0));

const daysSince = (d: Date): number => Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));

export async function syncDealRoomStage(tenantId: string, dealId: string): Promise<void> {
  const room = await getOpenDealRoom(tenantId, dealId);
  if (!room) return;
  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return;

  // 1) Ficha viva (detalle completo).
  await refreshDealRoomFicha(tenantId, dealId).catch(() => {});

  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    select: { title: true, amount: true, account: { select: { name: true } }, stage: { select: { name: true, order: true } } },
  });
  if (!deal?.stage) return;

  const [totalStages, lastChange] = await Promise.all([
    prisma.crmPipelineStage.count({ where: { tenantId, isActive: true, isClosedWon: false, isClosedLost: false } }),
    prisma.crmDealStageHistory.findFirst({ where: { tenantId, dealId }, orderBy: { changedAt: "desc" }, select: { changedAt: true } }),
  ]);
  const days = lastChange ? daysSince(lastChange.changedAt) : 0;
  const macro = stageMacroPhase(deal.stage.order ?? 0, totalStages);
  const monto = Number(deal.amount ?? 0);

  // 2) Topic: etapa visible sin ruido (el topic admite emoji; el nombre no).
  const topic = `${macro.emoji} Etapa: ${deal.stage.name}${monto ? ` · ${fmtClp(monto)}` : ""} · ${days}d`;
  await slackSetTopic(ws.botToken, room.slackChannelId, topic);

  // Board del hub #pipeline: refleja el nuevo estado/etapa (best-effort, debounced).
  await import("./pipeline-hub").then((m) => m.refreshPipelineHub(tenantId)).catch(() => {});

  // 3) Nombre del canal según estrategia.
  const cfg = await getDealRoomConfig(tenantId);
  if (cfg.channelNaming === "stable") return;
  const prefix = cfg.channelNaming === "stagePrefix" ? deal.stage.name : MACRO_TOKEN[macro.key];
  const token = slackSlug(prefix, 20, "neg");
  // Ya está en ese prefijo (incluye sufijos por name_taken, p. ej. neg-acme-2) → sin rename.
  if (room.slackChannelName.startsWith(`${token}-`)) return;
  const desired = dealRoomChannelName(deal.account.name, deal.title, prefix);
  if (desired === room.slackChannelName) return;
  try {
    const renamed = await slackRenameConversation(ws.botToken, room.slackChannelId, desired);
    await prisma.crmDealSlackRoom.updateMany({ where: { tenantId, dealId }, data: { slackChannelName: renamed.name } });
  } catch (e) {
    console.error("[slack] syncDealRoomStage rename falló:", e);
  }
}
