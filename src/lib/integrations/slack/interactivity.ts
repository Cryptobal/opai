/**
 * Manejo de interactividad de Slack (block_actions): confirmación/cancelación
 * de escrituras (patrón preview/confirm) y aprobación/rechazo de tickets.
 *
 * Corre en `after()` (el ACK 200 ya se envió). Toda ejecución usa la identidad
 * y permisos del Admin vinculado al usuario que PRESIONA el botón. Aislamiento:
 * la acción pendiente debe pertenecer al tenant resuelto por team_id.
 *
 * Concurrencia: la transición PENDING→(CONFIRMED|CANCELLED) es ATÓMICA
 * (`updateMany where status=PENDING`), así un doble-click o una redelivery de
 * Slack no ejecutan la escritura dos veces. Si la ejecución falla, se restaura a
 * PENDING para permitir reintento.
 */

import { prisma } from "@/lib/prisma";
import { hasCapability, hasModuleAccess } from "@/lib/permissions";
import { executeToolCallV2, WRITE_TOOL_LABELS } from "@/lib/ai/help-chat-tools-v2";
import { logAudit } from "@/lib/audit";
import { getTenantForTeam, getWorkspaceForTenant, type ActiveWorkspace } from "./workspace";
import { resolveLinkedAdmin, buildLinkPrompt, type LinkedAdmin } from "./user-link";
import { slackUpdateMessage, slackRespondUrl } from "./api";
import { assistantSection } from "./blocks";
import { publishHome } from "./home";
import { decideTicketApproval } from "@/lib/tickets-approvals";

/** Refresca el App Home del usuario tras completar una acción (best-effort). */
function refreshHome(tenantId: string, slackUserId: string): void {
  publishHome(tenantId, slackUserId).catch((e) => console.error("[slack] refresh Home falló:", e));
}

interface BlockActionsPayload {
  type?: string;
  team?: { id?: string };
  user?: { id?: string };
  response_url?: string;
  actions?: Array<{ action_id?: string; value?: string }>;
  container?: { channel_id?: string; message_ts?: string; is_ephemeral?: boolean };
}

type Pending = NonNullable<Awaited<ReturnType<typeof prisma.slackPendingAction.findFirst>>>;
interface RespondCtx {
  token: string;
  channel: string;
  ts: string;
  isEphemeral: boolean;
  responseUrl?: string;
  slackUserId: string;
}

/** Actualiza la tarjeta: chat.update para mensajes normales, response_url para efímeros. */
async function respondCard(ctx: RespondCtx, text: string): Promise<void> {
  const blocks = [assistantSection(text)];
  if (ctx.isEphemeral) {
    if (ctx.responseUrl) {
      await slackRespondUrl(ctx.responseUrl, { response_type: "ephemeral", replace_original: true, text, blocks }).catch(() => {});
    }
    return;
  }
  if (ctx.ts) await slackUpdateMessage(ctx.token, { channel: ctx.channel, ts: ctx.ts, text, blocks }).catch(() => {});
}

/** Transición atómica PENDING→status. Devuelve true si ESTE click ganó la carrera. */
async function claimPending(id: string, status: string, resolvedBy: string): Promise<boolean> {
  const r = await prisma.slackPendingAction.updateMany({
    where: { id, status: "PENDING", expiresAt: { gt: new Date() } },
    data: { status, resolvedBy, resolvedAt: new Date() },
  });
  return r.count === 1;
}

async function restorePending(id: string): Promise<void> {
  await prisma.slackPendingAction
    .updateMany({ where: { id }, data: { status: "PENDING", resolvedBy: null, resolvedAt: null } })
    .catch(() => {});
}

export async function handleInteractivity(payload: BlockActionsPayload): Promise<void> {
  if (payload.type !== "block_actions") return;
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const action = payload.actions?.[0];
  const actionId = action?.action_id;
  const pendingId = action?.value;

  // Hub de acciones (Fase 7): "Abrir" apila el modal de la acción (views.push).
  if (actionId.startsWith("opai_action_open")) {
    const { pushActionModal } = await import("./modals/dispatch");
    await pushActionModal(payload as unknown as Record<string, unknown>);
    return;
  }

  // Bandeja de tickets (Fase 7): filtros / paginación / acción por fila.
  if (actionId && actionId.startsWith("tray_")) {
    const { handleTrayAction } = await import("./tickets/tray-dispatch");
    await handleTrayAction(payload as unknown as Record<string, unknown>);
    return;
  }

  // Botón de gestión en la tarjeta de un ticket (Fase 7.1): abre el modal por-fila.
  if (actionId.startsWith("tcard")) {
    const { handleTicketCardAction } = await import("./tickets/tray-dispatch");
    await handleTicketCardAction(payload as unknown as Record<string, unknown>);
    return;
  }

  // Bandeja de aprobaciones (Fase 7): Aprobar / Rechazar inline.
  if (actionId === "appr_decide") {
    const { handleApprovalAction } = await import("./tickets/approvals");
    await handleApprovalAction(payload as unknown as Record<string, unknown>);
    return;
  }

  if (!teamId || !slackUserId || !actionId || !pendingId) return;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const responseUrl = payload.response_url;

  // Aislamiento: la acción debe ser de este tenant.
  const pending = await prisma.slackPendingAction.findFirst({
    where: { id: pendingId, tenantId: workspace.tenantId },
  });
  if (!pending) {
    if (responseUrl) await slackRespondUrl(responseUrl, { response_type: "ephemeral", text: "Esta acción ya no existe." });
    return;
  }

  const ctx: RespondCtx = {
    token: workspace.botToken,
    channel: pending.channelId,
    ts: pending.messageTs ?? payload.container?.message_ts ?? "",
    isEphemeral: !!payload.container?.is_ephemeral,
    responseUrl,
    slackUserId,
  };

  if (pending.status !== "PENDING" || pending.expiresAt.getTime() < Date.now()) {
    await respondCard(ctx, "⌛ Esta acción ya expiró o fue resuelta.");
    return;
  }

  // Identidad real del que presiona.
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) {
    if (responseUrl) {
      const prompt = buildLinkPrompt(workspace, slackUserId);
      await slackRespondUrl(responseUrl, { response_type: "ephemeral", text: prompt.text, blocks: prompt.blocks });
    }
    return;
  }

  if (actionId === "pending_cancel") {
    if (await claimPending(pending.id, "CANCELLED", linked.adminId)) {
      await respondCard(ctx, `❌ Cancelado por <@${slackUserId}>`);
    } else {
      await respondCard(ctx, "⌛ Esta acción ya expiró o fue resuelta.");
    }
    return;
  }
  if (actionId === "pending_confirm") return handleToolConfirm(workspace, pending, linked, ctx);
  if (actionId === "ticket_approve" || actionId === "ticket_reject") {
    return handleTicketDecision(workspace, pending, linked, ctx, actionId === "ticket_approve");
  }
}

async function handleToolConfirm(
  workspace: ActiveWorkspace, pending: Pending, linked: LinkedAdmin, ctx: RespondCtx,
): Promise<void> {
  if (pending.kind !== "TOOL_CONFIRM" || !pending.toolName) return;
  const label = WRITE_TOOL_LABELS[pending.toolName] ?? pending.toolName;

  // Reclama ANTES de ejecutar → evita doble ejecución por doble-click/redelivery.
  if (!(await claimPending(pending.id, "CONFIRMED", linked.adminId))) {
    await respondCard(ctx, "⌛ Esta acción ya expiró o fue resuelta.");
    return;
  }

  const args = (pending.toolArgs ?? {}) as Record<string, unknown>;
  let result: { ok?: boolean; error?: string };
  try {
    result = (await executeToolCallV2(
      pending.toolName, args, workspace.tenantId, linked.adminId,
      linked.perms, hasCapability(linked.perms, "rendicion_view_all"), null,
    )) as { ok?: boolean; error?: string };
  } catch (err) {
    console.error(`[slack] confirm ${pending.toolName} lanzó excepción:`, err);
    result = { ok: false, error: "error inesperado" };
  }

  if (!result?.ok) {
    await restorePending(pending.id); // permite reintento (permiso/dato inválido/transitorio)
    if (ctx.responseUrl) await slackRespondUrl(ctx.responseUrl, { response_type: "ephemeral", text: `⚠️ No se pudo completar *${label}*: ${result?.error ?? "error"}` });
    return;
  }
  await respondCard(ctx, `✅ *${label}* confirmado por <@${ctx.slackUserId}>`);
  refreshHome(workspace.tenantId, ctx.slackUserId);
  await logAudit({ action: "CREATE", entity: "SlackPendingAction", entityId: pending.id, tenantId: workspace.tenantId, userId: linked.adminId, details: { toolName: pending.toolName, kind: "TOOL_CONFIRM", via: "slack" } });
}

async function handleTicketDecision(
  workspace: ActiveWorkspace, pending: Pending, linked: LinkedAdmin, ctx: RespondCtx, approve: boolean,
): Promise<void> {
  if (pending.kind !== "TICKET_APPROVAL" || !pending.entityId) return;
  if (!hasModuleAccess(linked.perms, "ops")) {
    if (ctx.responseUrl) await slackRespondUrl(ctx.responseUrl, { response_type: "ephemeral", text: "No tienes permisos de Operaciones para decidir sobre este ticket." });
    return;
  }

  // Reclama atómicamente para que dos aprobadores no decidan en paralelo.
  if (!(await claimPending(pending.id, "CONFIRMED", linked.adminId))) {
    await respondCard(ctx, "⌛ Esta acción ya expiró o fue resuelta.");
    return;
  }

  const result = await decideTicketApproval({
    tenantId: workspace.tenantId, userId: linked.adminId,
    ticketId: pending.entityId, decision: approve ? "approved" : "rejected",
  });
  if (!result.ok) {
    // No la vencemos: puede ser transitorio (o ya resuelta). Restaurar permite
    // reintento; si el ticket ya no aplica, el re-click vuelve a mostrar el aviso.
    await restorePending(pending.id);
    await respondCard(ctx, `⚠️ ${result.error ?? "No se pudo procesar la aprobación."}`);
    return;
  }
  const verb = approve ? "aprobado" : "rechazado";
  await respondCard(ctx, `${approve ? "✅" : "❌"} Ticket *${result.ticketCode ?? ""}* ${verb} por <@${ctx.slackUserId}>`);
  refreshHome(workspace.tenantId, ctx.slackUserId);
  await logAudit({ action: "UPDATE", entity: "OpsTicket", entityId: pending.entityId, tenantId: workspace.tenantId, userId: linked.adminId, details: { decision: approve ? "approved" : "rejected", via: "slack" } });
}
