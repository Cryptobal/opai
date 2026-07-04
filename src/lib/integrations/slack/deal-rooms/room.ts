/**
 * Servicio de Deal Rooms (Fase 16, B1): abre y resuelve la sala de Slack de un
 * negocio.
 *
 * `openDealRoom` crea un canal PRIVADO `neg-{slug-cliente}`, invita al actor y
 * al owner del negocio, publica la ficha viva y la fija, guarda el map
 * `CrmDealSlackRoom` y audita. Idempotente por `dealId` (unique): si ya existe
 * sala, la devuelve sin recrear. `maybeAutoOpenDealRoom` aplica el umbral por
 * tenant (default APAGADO) — solo abre si `enabled` y el negocio lo supera.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getWorkspaceForTenant, type ActiveWorkspace } from "../workspace";
import {
  slackCreateConversation,
  slackConversationsInvite,
  slackSetPurpose,
  slackPostMessage,
  slackUpdateMessage,
  slackPinsAdd,
  SlackApiError,
} from "../api";
import { renderFicha } from "./ficha";
import { getDealRoomConfig } from "./config";

export interface OpenDealRoomResult {
  ok: boolean;
  channelId?: string;
  channelName?: string;
  alreadyExisted?: boolean;
  error?: string;
}

/** Normaliza el nombre del cliente a un nombre de canal Slack válido: `neg-{slug}`. */
export function dealRoomChannelName(accountName: string): string {
  const slug = (accountName || "negocio")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes (marcas diacríticas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 74) || "negocio";
  return `neg-${slug}`.slice(0, 80);
}

/** Devuelve la sala (cualquier estado) de un negocio, o null. */
export async function getDealRoom(tenantId: string, dealId: string) {
  return prisma.crmDealSlackRoom.findFirst({ where: { tenantId, dealId } });
}

/** Devuelve la sala OPEN de un negocio (para ruteo de eventos), o null. */
export async function getOpenDealRoom(tenantId: string, dealId: string) {
  return prisma.crmDealSlackRoom.findFirst({ where: { tenantId, dealId, status: "OPEN" } });
}

/**
 * Refresca la ficha viva fijada de una sala (chat.update sobre `fichaTs`). Se
 * llama tras cada evento del negocio que cae en su sala (B2). Best-effort:
 * si no hay sala OPEN, ficha, o workspace, no hace nada.
 */
export async function refreshDealRoomFicha(tenantId: string, dealId: string): Promise<void> {
  const room = await getOpenDealRoom(tenantId, dealId);
  if (!room?.fichaTs) return;
  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return;
  const ficha = await renderFicha(tenantId, dealId).catch(() => null);
  if (!ficha) return;
  await slackUpdateMessage(ws.botToken, {
    channel: room.slackChannelId, ts: room.fichaTs, text: ficha.text, blocks: ficha.blocks,
  }).catch((e) => console.error("[slack] refreshDealRoomFicha falló:", e));
}

/** Resuelve el slackUserId de un Admin vinculado (para invitar a la sala). */
async function slackUserIdForAdmin(workspaceId: string, adminId: string | null): Promise<string | null> {
  if (!adminId) return null;
  const link = await prisma.slackUserLink
    .findFirst({ where: { workspaceId, adminId }, select: { slackUserId: true } })
    .catch(() => null);
  return link?.slackUserId ?? null;
}

/** Crea el canal manejando `name_taken` con sufijos numéricos. */
async function createChannelWithFallback(
  ws: ActiveWorkspace,
  baseName: string,
): Promise<{ id: string; name: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const name = attempt === 0 ? baseName : `${baseName.slice(0, 76)}-${attempt + 1}`;
    try {
      return await slackCreateConversation(ws.botToken, name, true);
    } catch (err) {
      if (err instanceof SlackApiError && err.slackError === "name_taken") continue;
      throw err;
    }
  }
  throw new SlackApiError("name_taken");
}

/**
 * Abre (o devuelve) la sala de un negocio. `actorAdminId` es quien la abre (se
 * invita y queda como `createdBy`). Falla-suave: cualquier error de Slack se
 * refleja en `{ ok:false, error }` sin lanzar (el llamador decide el aviso).
 */
export async function openDealRoom(
  tenantId: string,
  dealId: string,
  actorAdminId: string,
): Promise<OpenDealRoomResult> {
  // Idempotencia: una sala por negocio (dealId unique).
  const existing = await getDealRoom(tenantId, dealId);
  if (existing) {
    return { ok: true, channelId: existing.slackChannelId, channelName: existing.slackChannelName, alreadyExisted: true };
  }

  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return { ok: false, error: "Slack no está conectado para tu organización." };

  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    select: { id: true, title: true, account: { select: { name: true, ownerId: true } } },
  });
  if (!deal) return { ok: false, error: "No encontré el negocio." };

  // 1) Crear el canal privado (con fallback de nombre).
  let channel: { id: string; name: string };
  try {
    channel = await createChannelWithFallback(ws, dealRoomChannelName(deal.account.name));
  } catch (err) {
    const code = err instanceof SlackApiError ? err.slackError : String(err);
    console.error("[slack] openDealRoom crear canal falló:", code);
    return { ok: false, error: `No pude crear la sala en Slack (${code}).` };
  }

  // 2) Invitar al actor + al owner del negocio (los que estén vinculados a Slack).
  const [actorSlack, ownerSlack] = await Promise.all([
    slackUserIdForAdmin(ws.id, actorAdminId),
    slackUserIdForAdmin(ws.id, deal.account.ownerId),
  ]);
  const invitees = [...new Set([actorSlack, ownerSlack].filter((x): x is string => !!x))];
  if (invitees.length) await slackConversationsInvite(ws.botToken, channel.id, invitees);

  // 3) Propósito del canal (contexto siempre visible en el header de Slack).
  await slackSetPurpose(ws.botToken, channel.id, `Sala del negocio "${deal.title}" (${deal.account.name}) · OPAI`);

  // 4) Ficha viva → publicar y fijar.
  let fichaTs: string | null = null;
  const ficha = await renderFicha(tenantId, dealId).catch(() => null);
  if (ficha) {
    try {
      const { ts } = await slackPostMessage(ws.botToken, { channel: channel.id, text: ficha.text, blocks: ficha.blocks });
      fichaTs = ts || null;
      if (fichaTs) await slackPinsAdd(ws.botToken, channel.id, fichaTs);
    } catch (err) {
      console.error("[slack] openDealRoom publicar ficha falló:", err);
    }
  }

  // 5) Persistir el map (unique dealId absorbe la carrera de doble-click).
  try {
    const room = await prisma.crmDealSlackRoom.create({
      data: {
        tenantId, dealId, slackChannelId: channel.id, slackChannelName: channel.name,
        fichaTs, status: "OPEN", createdBy: actorAdminId,
      },
      select: { slackChannelId: true, slackChannelName: true },
    });
    await logAudit({
      action: "CREATE", entity: "CrmDealSlackRoom", entityId: dealId, tenantId, userId: actorAdminId,
      details: { slackChannelId: channel.id, slackChannelName: channel.name, via: "slack" },
    });
    return { ok: true, channelId: room.slackChannelId, channelName: room.slackChannelName };
  } catch (err) {
    // Carrera: otro click creó la sala primero → devolver la que ganó.
    if ((err as { code?: string }).code === "P2002") {
      const won = await getDealRoom(tenantId, dealId);
      if (won) return { ok: true, channelId: won.slackChannelId, channelName: won.slackChannelName, alreadyExisted: true };
    }
    console.error("[slack] openDealRoom persistir map falló:", err);
    return { ok: false, error: "La sala se creó en Slack pero no pude registrarla. Reintenta." };
  }
}

/**
 * Aplica el umbral por tenant y abre la sala solo si corresponde. Se llama desde
 * el servicio real de cambio de etapa/monto. NUNCA abre si el tenant lo tiene
 * apagado (default). Silencioso: no lanza ni avisa (best-effort en background).
 */
export async function maybeAutoOpenDealRoom(tenantId: string, dealId: string, actorAdminId: string): Promise<void> {
  const cfg = await getDealRoomConfig(tenantId);
  if (!cfg.enabled) return;

  // Ya tiene sala → nada que hacer.
  if (await getDealRoom(tenantId, dealId)) return;

  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    select: { amount: true, status: true, stage: { select: { order: true } } },
  });
  if (!deal || deal.status !== "open") return;

  const amountOk = cfg.minAmountClp <= 0 || Number(deal.amount ?? 0) >= cfg.minAmountClp;
  const stageOk = cfg.minStageOrder <= 0 || (deal.stage?.order ?? 0) >= cfg.minStageOrder;
  // Umbrales configurados actúan como AND; los no configurados (0) no bloquean.
  if (!amountOk || !stageOk) return;

  const r = await openDealRoom(tenantId, dealId, actorAdminId).catch((e) => {
    console.error("[slack] maybeAutoOpenDealRoom falló:", e);
    return null;
  });
  if (r && !r.ok) console.error("[slack] maybeAutoOpenDealRoom no abrió la sala:", r.error);
}
