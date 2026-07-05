/**
 * Despacho de notificaciones del catálogo unificado hacia Slack.
 *
 * Se engancha UNA vez por llamada a `notify()`, a nivel tenant (ruteo
 * evento→canal), no por usuario. Corre en `after()` para no bloquear.
 * Tenants sin Slack: return inmediato, cero costo relevante.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { UnifiedNotificationType } from "@/lib/notifications/catalog";
import { getRondasNotifPolicy } from "@/lib/rondas/notification-policy";
import { getWorkspaceForTenant } from "./workspace";
import { approvalCardActionsBlock, buildNotificationBlocks, ticketActionsBlock, ticketCardActionsBlock, toContextFields } from "./blocks";
import { enrichTicketFields, convertBodyMentions } from "./card-enrich";
import { slackPostMessage, SlackApiError, isPermanentSlackError } from "./api";
import { getOpenDealRoom, refreshDealRoomFicha } from "./deal-rooms/room";
import { RONDA_INSTALLATION_ROUTE_KEYS, resolveInstallationSlackChannel } from "./installation-channel";

interface DispatchInput {
  tenantId: string;
  typeDef: UnifiedNotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  data?: Record<string, unknown> | null;
}

/** TTL amplio: la aprobación de ticket puede tardar días (el estado real manda). */
const TICKET_PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Resuelve el canal destino con precedencia KEY > CATEGORY > MODULE > default. */
export async function resolveChannel(
  tenantId: string,
  typeDef: UnifiedNotificationType,
  defaultChannelId: string | null,
): Promise<string | null> {
  const routes = await prisma.slackChannelRoute.findMany({
    where: {
      tenantId,
      enabled: true,
      OR: [
        { matchType: "KEY", matchValue: typeDef.key },
        { matchType: "CATEGORY", matchValue: typeDef.category },
        { matchType: "MODULE", matchValue: typeDef.module },
      ],
    },
    select: { matchType: true, channelId: true },
  });
  const byType = (t: string) => routes.find((r) => r.matchType === t)?.channelId;
  // Más específico gana: un evento (KEY) sobre su categoría, y la categoría sobre
  // todo el módulo. Sin regla → canal por defecto del workspace.
  return byType("KEY") ?? byType("CATEGORY") ?? byType("MODULE") ?? defaultChannelId;
}

/** True si el tenant tiene ruteo explícito (evento, categoría o módulo) para este tipo. */
export async function hasExplicitSlackChannelRoute(
  tenantId: string,
  typeDef: UnifiedNotificationType,
): Promise<boolean> {
  const count = await prisma.slackChannelRoute.count({
    where: {
      tenantId,
      enabled: true,
      OR: [
        { matchType: "KEY", matchValue: typeDef.key },
        { matchType: "CATEGORY", matchValue: typeDef.category },
        { matchType: "MODULE", matchValue: typeDef.module },
      ],
    },
  });
  return count > 0;
}

interface SharedSlackChannelResolution {
  workspace: NonNullable<Awaited<ReturnType<typeof getWorkspaceForTenant>>>;
  channelId: string;
  dealRoomLifecycleOnly: boolean;
  openDealRoomDealId: string | null;
  threadRondaId: string | null;
  rondaThreadTs?: string;
}

/** Resuelve si la notificación caerá en un canal compartido (KEY/CATEGORY/MODULE/default, sala, hilo ronda o instalación). */
export async function resolveSlackSharedChannelDestination(input: {
  tenantId: string;
  typeDef: UnifiedNotificationType;
  data?: Record<string, unknown> | null;
}): Promise<SharedSlackChannelResolution | null> {
  if (input.data?.skipSlack === true) return null;

  const workspace = await getWorkspaceForTenant(input.tenantId);
  if (!workspace) return null;

  const dealId = typeof input.data?.dealId === "string" ? input.data.dealId : null;
  const dealRoom = dealId ? await getOpenDealRoom(input.tenantId, dealId) : null;

  if (dealRoom && dealId && (input.typeDef.key === "deal_won" || input.typeDef.key === "deal_lost")) {
    return {
      workspace,
      channelId: dealRoom.slackChannelId,
      dealRoomLifecycleOnly: true,
      openDealRoomDealId: dealId,
      threadRondaId: null,
    };
  }

  let channelId = dealRoom
    ? dealRoom.slackChannelId
    : await resolveChannel(input.tenantId, input.typeDef, workspace.defaultChannelId);

  const threadRondaId =
    input.typeDef.key.startsWith("ronda_") && typeof input.data?.rondaId === "string"
      ? (input.data.rondaId as string)
      : null;
  let rondaThreadTs: string | undefined;
  if (threadRondaId) {
    const th = await prisma.rondaSlackThread.findUnique({
      where: { rondaEjecucionId: threadRondaId },
      select: { slackTs: true, slackChannelId: true },
    });
    if (th) {
      rondaThreadTs = th.slackTs;
      channelId = th.slackChannelId;
    }
  }

  if (!rondaThreadTs && RONDA_INSTALLATION_ROUTE_KEYS.has(input.typeDef.key)) {
    const installationId =
      typeof input.data?.installationId === "string" ? input.data.installationId : null;
    if (installationId) {
      const policy = await getRondasNotifPolicy(input.tenantId);
      if (policy.rondasRouteToInstallationChannel) {
        channelId =
          (await resolveInstallationSlackChannel(input.tenantId, installationId)) ??
          channelId;
      }
    }
  }

  if (!channelId) return null;

  return {
    workspace,
    channelId,
    dealRoomLifecycleOnly: false,
    openDealRoomDealId: dealRoom && dealId ? dealId : null,
    threadRondaId,
    rondaThreadTs,
  };
}

/** True si `dispatchSlackForNotification` publicaría en un canal compartido (no DM). */
export async function willDispatchSlackToSharedChannel(
  tenantId: string,
  typeDef: UnifiedNotificationType,
  data?: Record<string, unknown> | null,
): Promise<boolean> {
  const destination = await resolveSlackSharedChannelDestination({ tenantId, typeDef, data });
  return destination !== null;
}

export async function dispatchSlackForNotification(input: DispatchInput): Promise<void> {
  const destination = await resolveSlackSharedChannelDestination(input);
  if (!destination) return;

  const { workspace, channelId, dealRoomLifecycleOnly, openDealRoomDealId, threadRondaId, rondaThreadTs } = destination;

  const dealId = typeof input.data?.dealId === "string" ? input.data.dealId : null;

  // Cierre del negocio en su sala (Fase 16, B5): la tarjeta de won/lost la maneja
  // el ciclo de vida (resumen del bot + botones Archivar/Handoff). No publicamos
  // la tarjeta genérica para no duplicar; solo refrescamos la ficha.
  if (dealRoomLifecycleOnly && dealId) {
    const kind: "won" | "lost" = input.typeDef.key === "deal_won" ? "won" : "lost";
    const { postDealClosedCard } = await import("./deal-rooms/lifecycle");
    await postDealClosedCard(input.tenantId, dealId, kind).catch((e) =>
      console.error("[slack] postDealClosedCard falló:", e),
    );
    await refreshDealRoomFicha(input.tenantId, dealId).catch(() => {});
    // Cierre automático (Fase 3): ganar → canal operativo (handoff), perder →
    // archivar. Config por tenant (default: ambos ON). Los botones de la tarjeta
    // quedan de respaldo/rehacer. Best-effort: no rompe el dispatch.
    try {
      const { getDealRoomConfig } = await import("./deal-rooms/config");
      const cfg = await getDealRoomConfig(input.tenantId);
      const actor = typeof input.data?.actorAdminId === "string" ? input.data.actorAdminId : "system";
      if (kind === "won" && cfg.autoHandoffOnWon) {
        const { handoffDealRoomToOps } = await import("./deal-rooms/lifecycle");
        await handoffDealRoomToOps(input.tenantId, dealId, actor).catch((e) => console.error("[slack] auto-handoff falló:", e));
      } else if (kind === "lost" && cfg.autoArchiveOnLost) {
        const { archiveDealRoom } = await import("./deal-rooms/lifecycle");
        await archiveDealRoom(input.tenantId, dealId, actor).catch((e) => console.error("[slack] auto-archive falló:", e));
      }
      // Board del hub #pipeline: saca el negocio cerrado del board.
      const { refreshPipelineHub } = await import("./deal-rooms/pipeline-hub");
      await refreshPipelineHub(input.tenantId).catch(() => {});
    } catch (e) {
      console.error("[slack] cierre automático deal room falló:", e);
    }
    return;
  }

  // Tickets: dispatch tiene el id pero no el objeto → carga curada por ticketId.
  // Los demás eventos usan el renderer genérico sobre el data ya enriquecido en origen.
  const cardTicketId =
    input.typeDef.key.startsWith("ticket_") && typeof input.data?.ticketId === "string"
      ? (input.data.ticketId as string)
      : null;
  const ticketFields = cardTicketId ? await enrichTicketFields(input.tenantId, cardTicketId, workspace) : [];

  // Menciones OPAI→Slack: convierte "@Nombre" del cuerpo del comentario en
  // `<@U...>` cuando el mencionado está vinculado (para que le llegue en Slack).
  const body =
    input.body && Array.isArray(input.data?.mentions)
      ? await convertBodyMentions(input.body, input.data.mentions as unknown[], workspace)
      : input.body;

  // Momento caliente (Fase 15): la tarjeta de quote_viewed usa campos curados.
  const isQuoteViewed = input.typeDef.key === "quote_viewed";
  let curatedFields: Array<{ label: string; value: string }> | null = null;
  if (isQuoteViewed) {
    const { quoteViewedFields } = await import("./comercial/quote-viewed");
    curatedFields = quoteViewedFields(input.data);
  }

  const { text, blocks } = buildNotificationBlocks({
    title: input.title,
    body,
    category: input.typeDef.category,
    phone: typeof input.data?.phone === "string" ? input.data.phone : null,
    fields: ticketFields.length ? ticketFields : curatedFields ?? toContextFields(input.data),
    link: input.link,
    critical: input.typeDef.critical,
  });

  // Fila accionable de la tarjeta 🔥: WhatsApp "¿te llamo?" + Recordar 1h.
  if (isQuoteViewed && typeof input.data?.quoteId === "string") {
    const { resolveQuoteViewedWaUrl, quoteViewedActionsBlock } = await import("./comercial/quote-viewed");
    const waUrl = await resolveQuoteViewedWaUrl(input.tenantId, input.data).catch(() => null);
    blocks.push(quoteViewedActionsBlock(input.data.quoteId as string, waUrl));
  }

  // Gestión del ticket desde su tarjeta (excepto la de aprobación, que ya trae
  // Aprobar/Rechazar): Comentar · Estado · Aplazar/Pausar SLA · Silenciar.
  if (cardTicketId && input.typeDef.key !== "ticket_needs_approval") {
    const code = typeof input.data?.code === "string" ? input.data.code : cardTicketId;
    blocks.push(ticketCardActionsBlock(cardTicketId, code));
  }

  // Cockpit comercial (Fase 15): la tarjeta de `new_lead` gana su fila de acciones
  // (los 5 min de oro). Requiere leadId en el data del emisor.
  if (input.typeDef.key === "new_lead" && typeof input.data?.leadId === "string") {
    const leadId = input.data.leadId as string;
    const { leadCockpitActionsBlock } = await import("./comercial/lead-card");
    const { resolveLeadWaUrl } = await import("./comercial/lead-actions");
    const lead = await prisma.crmLead.findFirst({
      where: { id: leadId, tenantId: input.tenantId },
      select: {
        id: true, firstName: true, lastName: true, companyName: true, email: true, phone: true,
        commune: true, city: true, address: true, industry: true, serviceType: true,
        status: true, source: true, firstContactAt: true, firstContactBy: true,
      },
    });
    const waUrl = lead ? await resolveLeadWaUrl(input.tenantId, lead).catch(() => null) : null;
    blocks.push(leadCockpitActionsBlock(leadId, waUrl));
  }

  // Documentos por vencer (Fase 18): tarjeta gestionable — 📄 Ver documento ·
  // ⏳ En trámite · 🔕 Ya no aplica. Requiere data.docRef ("operacional:<id>" |
  // "guardia:<id>") que ponen los crons del motor de hitos.
  const DOC_EXPIRY_CARD_KEYS = new Set([
    "doc_operacional_expiring", "doc_operacional_expired",
    "guardia_doc_expiring", "guardia_doc_expired",
    "doc_escalated",
  ]);
  if (DOC_EXPIRY_CARD_KEYS.has(input.typeDef.key) && typeof input.data?.docRef === "string") {
    const { docCardActionsBlock } = await import("./docs/card-actions");
    blocks.push(docCardActionsBlock(input.data.docRef as string, input.link ?? null));
  }

  // Tarjeta accionable de aprobación: ticket (Fase 7), rendición o TE (Fase 13).
  // Cada una crea una SlackPendingAction y adjunta sus botones Aprobar/Rechazar.
  const approval: { kind: string; domain: "ticket" | "rendicion" | "te"; entityId: string } | null =
    input.typeDef.key === "ticket_needs_approval" && typeof input.data?.ticketId === "string"
      ? { kind: "TICKET_APPROVAL", domain: "ticket", entityId: input.data.ticketId as string }
      : input.typeDef.key === "rendicion_submitted" && typeof input.data?.rendicionId === "string"
        ? { kind: "RENDICION_APPROVAL", domain: "rendicion", entityId: input.data.rendicionId as string }
        : input.typeDef.key === "te_created" && typeof input.data?.teId === "string"
          ? { kind: "TE_APPROVAL", domain: "te", entityId: input.data.teId as string }
          : null;

  // Hilo por ticket (Fase 7): cualquier evento ticket_* con data.ticketId cae en
  // el hilo de ese ticket. La tarjeta de creación establece la raíz.
  const threadTicketId =
    input.typeDef.key.startsWith("ticket_") && typeof input.data?.ticketId === "string"
      ? (input.data.ticketId as string)
      : null;
  let threadTs: string | undefined = rondaThreadTs;
  if (threadTicketId) {
    const th = await prisma.ticketSlackThread.findUnique({
      where: { ticketId: threadTicketId },
      select: { slackTs: true },
    });
    threadTs = th?.slackTs;
  }

  // Dedupe en ráfagas: mismo (tenant, key, title, canal) dentro del mismo minuto.
  // Para aprobaciones se incluye el entityId, así dos ítems distintos con el mismo
  // título en el mismo minuto NO colisionan (perderían sus botones).
  const minute = Math.floor(Date.now() / 60000);
  // Rondas: el título es genérico ("✅ Ronda completada") — sin el rondaId dos
  // rondas distintas terminando el mismo minuto colisionarían en el dedupe.
  const dedupeMaterialBase = approval
    ? `${input.tenantId}|${input.typeDef.key}|${input.title}|e:${approval.entityId}|${minute}`
    : threadRondaId
      ? `${input.tenantId}|${input.typeDef.key}|${input.title}|r:${threadRondaId}|${minute}`
      : `${input.tenantId}|${input.typeDef.key}|${input.title}|${minute}`;

  await deliverSlackCard({
    tenantId: input.tenantId,
    typeKey: input.typeDef.key,
    workspace,
    channelId,
    text,
    blocks,
    threadTs,
    dedupeMaterialBase,
    link: input.link,
    data: input.data,
    approval,
    threadSideEffects: {
      threadTicketId,
      threadRondaId,
      rondaThreadTs,
    },
  });

  // Ficha viva al día: todo evento del negocio que cae en su sala re-edita la
  // tarjeta fijada (chat.update) para reflejar el estado actual. Best-effort.
  if (openDealRoomDealId) {
    await refreshDealRoomFicha(input.tenantId, openDealRoomDealId).catch((e) =>
      console.error("[slack] refresh ficha tras evento falló:", e),
    );
  }
}

type SlackWorkspaceRow = NonNullable<Awaited<ReturnType<typeof getWorkspaceForTenant>>>;

type DeliverSlackCardInput = {
  tenantId: string;
  typeKey: string;
  workspace: SlackWorkspaceRow;
  channelId: string;
  text: string;
  blocks: ReturnType<typeof buildNotificationBlocks>["blocks"];
  dedupeMaterialBase: string;
  threadTs?: string;
  link?: string | null;
  data?: Record<string, unknown> | null;
  approval?: { kind: string; domain: "ticket" | "rendicion" | "te"; entityId: string } | null;
  threadSideEffects?: {
    threadTicketId?: string | null;
    threadRondaId?: string | null;
    rondaThreadTs?: string | undefined;
  };
};

async function deliverSlackCard(input: DeliverSlackCardInput): Promise<void> {
  const {
    tenantId,
    typeKey,
    workspace,
    channelId,
    text,
    blocks,
    dedupeMaterialBase,
    threadTs,
    link,
    data,
    approval,
    threadSideEffects,
  } = input;
  const { threadTicketId, threadRondaId, rondaThreadTs } = threadSideEffects ?? {};

  const dedupeKey = createHash("sha1")
    .update(`${dedupeMaterialBase}|c:${channelId}`)
    .digest("hex");

  let outboxId: string;
  try {
    const row = await prisma.slackOutbox.create({
      data: {
        tenantId,
        workspaceId: workspace.id,
        channelId,
        payload: { text, blocks, thread_ts: threadTs } as object,
        dedupeKey,
        status: "PENDING",
      },
      select: { id: true },
    });
    outboxId = row.id;
  } catch (err) {
    // P2002 = choque de unique (dedupe): otra notificación idéntica ya encolada.
    if ((err as { code?: string }).code === "P2002") return;
    throw err;
  }

  // Pendiente de aprobación: se crea la SlackPendingAction DESPUÉS de pasar el
  // dedupe (evita huérfanas), se adjuntan los botones Aprobar/Rechazar y se
  // re-persiste el payload del outbox con los botones incluidos.
  let approvalPendingId: string | null = null;
  if (approval) {
    const pa = await prisma.slackPendingAction.create({
      data: {
        tenantId,
        workspaceId: workspace.id,
        kind: approval.kind,
        entityId: approval.entityId,
        requestedBySlackUserId: "system",
        channelId,
        status: "PENDING",
        expiresAt: new Date(Date.now() + TICKET_PENDING_TTL_MS),
      },
      select: { id: true },
    });
    approvalPendingId = pa.id;
    blocks.push(approval.domain === "ticket" ? ticketActionsBlock(pa.id) : approvalCardActionsBlock(approval.domain, pa.id));
    await prisma.slackOutbox.update({
      where: { id: outboxId },
      data: { payload: { text, blocks, thread_ts: threadTs } as object },
    });
  }

  // Intento de envío inmediato; el cron reintenta los que queden FAILED.
  try {
    const { ts } = await slackPostMessage(workspace.botToken, {
      channel: channelId,
      text,
      blocks,
      thread_ts: threadTs,
    });
    await prisma.slackOutbox.update({
      where: { id: outboxId },
      data: { status: "SENT", sentAt: new Date(), slackTs: ts },
    });
    // Ancla la tarjeta de aprobación al mensaje publicado para actualizarla al decidir.
    if (approvalPendingId && ts) {
      await prisma.slackPendingAction.update({ where: { id: approvalPendingId }, data: { messageTs: ts } });
    }
    // Raíz del hilo: el PRIMER mensaje de un ticket sin hilo previo queda de ancla
    // — sea cual sea el evento (Fase 14). Así un ticket anterior a F7.1 funda su
    // hilo con el próximo recordatorio y todos los siguientes encadenan bajo él.
    // El unique(ticketId) + catch absorbe la carrera de eventos concurrentes.
    if (threadTicketId && !threadTs && ts) {
      await prisma.ticketSlackThread
        .create({ data: { tenantId, ticketId: threadTicketId, slackChannelId: channelId, slackTs: ts } })
        .catch(() => {});
    }
    // Raíz del hilo de ronda (Fase 19): SOLO ronda_started funda el hilo (a
    // diferencia de tickets) — un término sin inicio queda suelto a propósito
    // (rondaStartedEnabled=false u offline sync). Unique + catch absorbe carreras.
    if (threadRondaId && !rondaThreadTs && ts && typeKey === "ronda_started") {
      await prisma.rondaSlackThread
        .create({ data: { tenantId, rondaEjecucionId: threadRondaId, slackChannelId: channelId, slackTs: ts } })
        .catch(() => {});
    }
    // Término publicado como reply → la raíz se re-edita con el desenlace
    // ("🛡️ Ronda X · Instalación · Guardia → ✅ 12/12 en 42 min").
    if (threadRondaId && rondaThreadTs && ts && typeKey === "ronda_completed") {
      const { updateRondaThreadRoot } = await import("./rondas-thread");
      await updateRondaThreadRoot({
        botToken: workspace.botToken,
        channelId,
        rootTs: rondaThreadTs,
        data,
        link,
      });
    }
  } catch (err) {
    const reason = err instanceof SlackApiError ? err.slackError : String(err);
    const permanent = err instanceof SlackApiError && isPermanentSlackError(err.slackError);
    console.error(
      permanent
        ? "[slack] envío falló con error permanente, sin reintentos:"
        : "[slack] envío inmediato falló, queda para reintento:",
      reason,
    );
    await prisma.slackOutbox.update({
      where: { id: outboxId },
      // permanent → attempts al tope: el cron (attempts < 5) no lo vuelve a tomar.
      data: { status: "FAILED", attempts: permanent ? 5 : 1, lastError: reason },
    });
  }
}
