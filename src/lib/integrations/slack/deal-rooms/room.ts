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
  slackListChannels,
  slackConversationMembers,
  slackSetPurpose,
  slackPostMessage,
  slackUpdateMessage,
  slackPinsAdd,
  SlackApiError,
} from "../api";
import { renderFicha } from "./ficha";
import { getDealRoomConfig, type ChannelNaming } from "./config";

export interface OpenDealRoomResult {
  ok: boolean;
  channelId?: string;
  channelName?: string;
  /** Team de Slack (para construir el deep link que abre el canal en la app). */
  teamId?: string;
  alreadyExisted?: boolean;
  error?: string;
}

/** Slugifica a caracteres válidos de canal Slack (minúsculas, dígitos, guiones). */
export function slackSlug(raw: string, max: number, fallback: string): string {
  return (
    (raw || fallback)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // quita tildes (marcas diacríticas combinantes)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max) || fallback
  );
}

/**
 * Nombre de canal Slack válido para la sala: `{prefix}-{cliente}-{negocio}[-{etapa}]`.
 * Incluir el nombre del negocio (además del cliente) permite ordenar/distinguir
 * varias salas de un mismo cliente. `dealTitle` opcional (si falta o queda vacío
 * tras slug, se omite, retrocompatible).
 * - `opts.prefix` (default "neg") refleja la etapa/macro-fase en el prefijo
 *   (naming "stagePrefix"/"emoji", Fase 3).
 * - `opts.stage` agrega la etapa al FINAL (naming "stageSuffix"): con etapa se
 *   recorta el presupuesto de cliente/negocio para caber en 80 chars.
 * Slack no admite emoji en nombres → todo ascii; el emoji de macro vive en el topic.
 */
export function dealRoomChannelName(
  accountName: string,
  dealTitle?: string | null,
  opts?: { prefix?: string; stage?: string | null },
): string {
  const pfx = slackSlug(opts?.prefix ?? "neg", 20, "neg");
  const stage = opts?.stage ? slackSlug(opts.stage, 24, "") : "";
  const cliente = slackSlug(accountName, stage ? 24 : 32, "cliente");
  const negocio = dealTitle ? slackSlug(dealTitle, stage ? 22 : 30, "") : "";
  return [pfx, cliente, negocio, stage].filter(Boolean).join("-").slice(0, 80);
}

/**
 * Nombre de canal deseado según la estrategia de naming del tenant. Fuente única
 * usada por la creación (`openDealRoom`) y el renombrado por etapa (`syncDealRoomStage`).
 * `macroToken` solo lo consume "emoji" (lo calcula el llamador que sí conoce el total
 * de etapas); en creación se puede pasar "neg" (fase temprana) y el 1er cambio corrige.
 */
export function resolveDealRoomName(
  naming: ChannelNaming,
  input: { accountName: string; dealTitle?: string | null; stageName?: string | null; macroToken?: string },
): string {
  const { accountName, dealTitle = null } = input;
  switch (naming) {
    case "stageSuffix":
      return dealRoomChannelName(accountName, dealTitle, { stage: input.stageName ?? null });
    case "stagePrefix":
      return dealRoomChannelName(accountName, dealTitle, { prefix: input.stageName ?? "neg" });
    case "emoji":
      return dealRoomChannelName(accountName, dealTitle, { prefix: input.macroToken ?? "neg" });
    case "stable":
    default:
      return dealRoomChannelName(accountName, dealTitle);
  }
}

/** Devuelve la sala (cualquier estado) de un negocio, o null. */
export async function getDealRoom(tenantId: string, dealId: string) {
  return prisma.crmDealSlackRoom.findFirst({ where: { tenantId, dealId } });
}

/** Devuelve la sala OPEN de un negocio (para ruteo de eventos), o null. */
export async function getOpenDealRoom(tenantId: string, dealId: string) {
  return prisma.crmDealSlackRoom.findFirst({ where: { tenantId, dealId, status: "OPEN" } });
}

/** Devuelve la sala (cualquier estado) por su canal de Slack, o null. */
export async function getDealRoomByChannel(tenantId: string, slackChannelId: string) {
  return prisma.crmDealSlackRoom.findFirst({ where: { tenantId, slackChannelId } });
}

/**
 * Sincroniza el nombre guardado cuando el canal se renombra EN Slack (evento
 * `channel_rename`). El `slackChannelId` es el ancla estable; el nombre es solo
 * display cache. Best-effort e idempotente: si el canal no es de un negocio,
 * `updateMany` no afecta filas. Devuelve cuántas salas se actualizaron.
 */
export async function syncDealRoomNameFromSlack(
  tenantId: string,
  slackChannelId: string,
  newName: string,
): Promise<number> {
  if (!slackChannelId || !newName) return 0;
  const { count } = await prisma.crmDealSlackRoom.updateMany({
    where: { tenantId, slackChannelId },
    data: { slackChannelName: newName },
  });
  return count;
}

/**
 * Espeja una nota nueva de un negocio en su sala de Slack (decisión B2/B3: las
 * notas del deal también fluyen a la sala). Best-effort; no hace nada si el
 * negocio no tiene sala OPEN.
 */
export async function mirrorDealNoteToRoom(
  tenantId: string,
  dealId: string,
  content: string,
  authorName: string,
  interactionType?: string | null,
): Promise<void> {
  const room = await getOpenDealRoom(tenantId, dealId);
  if (!room) return;
  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return;
  // Encabezado tipado (paridad con el modal de Slack): 📞 Llamado / 🚶 Visita /
  // 🤝 Reunión / ✉️ Contacto registran; la nota simple usa "guardó una nota".
  const { interactionMeta } = await import("@/lib/crm/interaction-types");
  const meta = interactionType ? interactionMeta(interactionType) : null;
  const header =
    meta && meta.key !== "note"
      ? `${meta.emoji} *${authorName}* registró — ${meta.label}:`
      : `📝 *${authorName}* guardó una nota:`;
  const line = `${header}\n>${content.replace(/\n/g, "\n>").slice(0, 2800)}`;
  await slackPostMessage(ws.botToken, { channel: room.slackChannelId, text: line.slice(0, 3000) }).catch((e) =>
    console.error("[slack] mirrorDealNoteToRoom falló:", e),
  );
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

/**
 * Supervisor a auto-invitar (Fase 3): el asignado ACTIVO de una instalación
 * activada por este negocio (OpsAsignacionSupervisor). null si no hay. OPAI no
 * modela supervisor en el deal → se llega por la instalación (activatedByDealId).
 */
async function resolveDealSupervisorAdminId(tenantId: string, dealId: string): Promise<string | null> {
  const sup = await prisma.opsAsignacionSupervisor
    .findFirst({
      where: { tenantId, isActive: true, installation: { activatedByDealId: dealId } },
      orderBy: { createdAt: "desc" },
      select: { supervisorId: true },
    })
    .catch(() => null);
  return sup?.supervisorId ?? null;
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
    // teamId best-effort para el deep link; si Slack no responde, igual devolvemos la sala.
    const wsExisting = await getWorkspaceForTenant(tenantId).catch(() => null);
    return {
      ok: true,
      channelId: existing.slackChannelId,
      channelName: existing.slackChannelName,
      teamId: wsExisting?.slackTeamId,
      alreadyExisted: true,
    };
  }

  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return { ok: false, error: "Slack no está conectado para tu organización." };

  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    select: { id: true, title: true, stage: { select: { name: true } }, account: { select: { name: true, ownerId: true } } },
  });
  if (!deal) return { ok: false, error: "No encontré el negocio." };

  // 1) Crear el canal privado (con fallback de nombre). El nombre ya refleja la
  //    etapa actual según la estrategia del tenant (default: etapa al final).
  const cfg = await getDealRoomConfig(tenantId);
  const initialName = resolveDealRoomName(cfg.channelNaming, {
    accountName: deal.account.name,
    dealTitle: deal.title,
    stageName: deal.stage?.name,
    macroToken: "neg",
  });
  let channel: { id: string; name: string };
  try {
    channel = await createChannelWithFallback(ws, initialName);
  } catch (err) {
    const code = err instanceof SlackApiError ? err.slackError : String(err);
    console.error("[slack] openDealRoom crear canal falló:", code);
    return { ok: false, error: `No pude crear la sala en Slack (${code}).` };
  }

  // 2) Invitar al actor + owner del negocio + supervisor de la instalación
  //    (los que estén vinculados a Slack; los no vinculados se omiten sin fallar).
  const supervisorAdminId = await resolveDealSupervisorAdminId(tenantId, dealId);
  const [actorSlack, ownerSlack, supervisorSlack] = await Promise.all([
    slackUserIdForAdmin(ws.id, actorAdminId),
    slackUserIdForAdmin(ws.id, deal.account.ownerId),
    slackUserIdForAdmin(ws.id, supervisorAdminId),
  ]);
  const invitees = [...new Set([actorSlack, ownerSlack, supervisorSlack].filter((x): x is string => !!x))];
  if (invitees.length) await slackConversationsInvite(ws.botToken, channel.id, invitees);

  // Equipo de operaciones: invitar a los miembros de #operaciones si el canal existe.
  try {
    const all = await slackListChannels(ws.botToken);
    const ops = all.find((c) => c.name === "operaciones");
    if (ops) {
      const members = await slackConversationMembers(ws.botToken, ops.id);
      const toAdd = members.filter((m) => !invitees.includes(m));
      if (toAdd.length) await slackConversationsInvite(ws.botToken, channel.id, toAdd);
    }
  } catch (e) {
    console.error("[slack] invitar #operaciones falló:", e);
  }

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

  // 4.5) Resumen rico de la cotización (dotación, sueldos, monto, ubicación…).
  //      Best-effort: no bloquea la creación de la sala si falla.
  await import("./quote-resumen")
    .then((m) => m.postQuoteResumenToRoom(tenantId, dealId, { ws, channelId: channel.id }))
    .catch((e) => console.error("[slack] openDealRoom resumen cotización falló:", e));

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
    // Board del hub #pipeline (Fase 3): refresca para incluir la nueva sala.
    await import("./pipeline-hub").then((m) => m.refreshPipelineHub(tenantId)).catch(() => {});
    return { ok: true, channelId: room.slackChannelId, channelName: room.slackChannelName, teamId: ws.slackTeamId };
  } catch (err) {
    // Carrera: otro click creó la sala primero → devolver la que ganó.
    if ((err as { code?: string }).code === "P2002") {
      const won = await getDealRoom(tenantId, dealId);
      if (won) return { ok: true, channelId: won.slackChannelId, channelName: won.slackChannelName, teamId: ws.slackTeamId, alreadyExisted: true };
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

/**
 * Reenvía al canal toda la info del negocio (botón "Actualizar sala"): refresca
 * la ficha viva fijada, re-publica el resumen de la cotización con los datos
 * actuales y re-renderiza el Canvas de Inicio si el negocio ya está adjudicado.
 * Requiere una sala OPEN. Best-effort por parte: nunca lanza.
 */
export async function resendDealRoomInfo(
  tenantId: string,
  dealId: string,
): Promise<{ ok: boolean; message: string }> {
  const room = await getOpenDealRoom(tenantId, dealId);
  if (!room) return { ok: false, message: "Este negocio aún no tiene una sala abierta en Slack." };

  // 1) Ficha viva (in-place). 2) Resumen de cotización (nuevo mensaje). 3) Canvas.
  await refreshDealRoomFicha(tenantId, dealId).catch((e) => console.error("[slack] resend ficha falló:", e));
  await import("./quote-resumen")
    .then((m) => m.postQuoteResumenToRoom(tenantId, dealId, { channelId: room.slackChannelId }))
    .catch((e) => console.error("[slack] resend resumen falló:", e));
  await import("./start-canvas")
    .then((m) => m.renderStartCanvasForDeal(tenantId, dealId, { ignoreFlag: true }))
    .catch((e) => console.error("[slack] resend canvas falló:", e));

  return { ok: true, message: `Info reenviada a la sala #${room.slackChannelName}.` };
}
