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
import { getWorkspaceForTenant } from "./workspace";
import { approvalCardActionsBlock, buildNotificationBlocks, ticketActionsBlock, ticketCardActionsBlock, toContextFields } from "./blocks";
import { enrichTicketFields, convertBodyMentions } from "./card-enrich";
import { slackPostMessage, SlackApiError, isPermanentSlackError } from "./api";

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
async function resolveChannel(
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

export async function dispatchSlackForNotification(input: DispatchInput): Promise<void> {
  // Notificación marcada para NO re-postear a Slack (p. ej. mención cuyo origen
  // ya fue Slack): la entrega in-app/push la maneja notify(); acá se corta.
  if (input.data?.skipSlack === true) return;

  const workspace = await getWorkspaceForTenant(input.tenantId);
  if (!workspace) return; // tenant sin Slack conectado

  const channelId = await resolveChannel(input.tenantId, input.typeDef, workspace.defaultChannelId);
  if (!channelId) return; // sin ruta ni canal por defecto

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

  const { text, blocks } = buildNotificationBlocks({
    title: input.title,
    body,
    category: input.typeDef.category,
    phone: typeof input.data?.phone === "string" ? input.data.phone : null,
    fields: ticketFields.length ? ticketFields : toContextFields(input.data),
    link: input.link,
    critical: input.typeDef.critical,
  });

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
  let threadTs: string | undefined;
  if (threadTicketId) {
    const th = await prisma.ticketSlackThread.findUnique({
      where: { ticketId: threadTicketId },
      select: { slackTs: true },
    });
    threadTs = th?.slackTs;
  }

  // Dedupe en ráfagas: mismo (tenant, key, title) dentro del mismo minuto. Para
  // aprobaciones se incluye el entityId, así dos ítems distintos con el mismo
  // título en el mismo minuto NO colisionan (perderían sus botones).
  const minute = Math.floor(Date.now() / 60000);
  const dedupeMaterial = approval
    ? `${input.tenantId}|${input.typeDef.key}|${input.title}|e:${approval.entityId}|${minute}`
    : `${input.tenantId}|${input.typeDef.key}|${input.title}|${minute}`;
  const dedupeKey = createHash("sha1").update(dedupeMaterial).digest("hex");

  let outboxId: string;
  try {
    const row = await prisma.slackOutbox.create({
      data: {
        tenantId: input.tenantId,
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
        tenantId: input.tenantId,
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
        .create({ data: { tenantId: input.tenantId, ticketId: threadTicketId, slackChannelId: channelId, slackTs: ts } })
        .catch(() => {});
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
