/**
 * Manejo de interactividad de Slack (block_actions): confirmación/cancelación
 * de escrituras (patrón preview/confirm) y aprobación/rechazo de tickets.
 *
 * Corre en `after()` (el ACK 200 ya se envió). Toda ejecución usa la identidad
 * y permisos del Admin vinculado al usuario que PRESIONA el botón. Aislamiento:
 * la acción pendiente debe pertenecer al tenant resuelto por team_id.
 */

import { prisma } from "@/lib/prisma";
import { hasCapability, hasModuleAccess } from "@/lib/permissions";
import { executeToolCallV2, WRITE_TOOL_LABELS } from "@/lib/ai/help-chat-tools-v2";
import { logAudit } from "@/lib/audit";
import { getTenantForTeam, getWorkspaceForTenant, type ActiveWorkspace } from "./workspace";
import { resolveLinkedAdmin, buildLinkPrompt, type LinkedAdmin } from "./user-link";
import { slackUpdateMessage, slackRespondUrl } from "./api";
import { assistantSection } from "./blocks";
import { decideTicketApproval } from "@/lib/tickets-approvals";

interface BlockActionsPayload {
  type?: string;
  team?: { id?: string };
  user?: { id?: string };
  response_url?: string;
  actions?: Array<{ action_id?: string; value?: string }>;
  container?: { channel_id?: string; message_ts?: string };
}

type Card = { channel: string; ts: string };
type Pending = NonNullable<Awaited<ReturnType<typeof prisma.slackPendingAction.findFirst>>>;

async function updateCard(token: string, card: Card, text: string): Promise<void> {
  if (!card.ts) return;
  await slackUpdateMessage(token, { channel: card.channel, ts: card.ts, text, blocks: [assistantSection(text)] }).catch(() => {});
}

export async function handleInteractivity(payload: BlockActionsPayload): Promise<void> {
  if (payload.type !== "block_actions") return;
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const action = payload.actions?.[0];
  const actionId = action?.action_id;
  const pendingId = action?.value;
  if (!teamId || !slackUserId || !actionId || !pendingId) return;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const token = workspace.botToken;
  const responseUrl = payload.response_url;

  // Aislamiento: la acción debe ser de este tenant.
  const pending = await prisma.slackPendingAction.findFirst({
    where: { id: pendingId, tenantId: workspace.tenantId },
  });
  if (!pending) {
    if (responseUrl) await slackRespondUrl(responseUrl, { response_type: "ephemeral", text: "Esta acción ya no existe." });
    return;
  }
  const card: Card = { channel: pending.channelId, ts: pending.messageTs ?? payload.container?.message_ts ?? "" };

  if (pending.status !== "PENDING" || pending.expiresAt.getTime() < Date.now()) {
    await updateCard(token, card, "⌛ Esta acción ya expiró o fue resuelta.");
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
    await prisma.slackPendingAction.update({ where: { id: pending.id }, data: { status: "CANCELLED", resolvedBy: linked.adminId, resolvedAt: new Date() } });
    await updateCard(token, card, `❌ Cancelado por <@${slackUserId}>`);
    return;
  }
  if (actionId === "pending_confirm") return handleToolConfirm(workspace, pending, linked, slackUserId, token, card, responseUrl);
  if (actionId === "ticket_approve" || actionId === "ticket_reject") {
    return handleTicketDecision(workspace, pending, linked, slackUserId, token, card, responseUrl, actionId === "ticket_approve");
  }
}

async function handleToolConfirm(
  workspace: ActiveWorkspace, pending: Pending, linked: LinkedAdmin,
  slackUserId: string, token: string, card: Card, responseUrl?: string,
): Promise<void> {
  if (pending.kind !== "TOOL_CONFIRM" || !pending.toolName) return;
  const args = (pending.toolArgs ?? {}) as Record<string, unknown>;
  const label = WRITE_TOOL_LABELS[pending.toolName] ?? pending.toolName;
  const result = (await executeToolCallV2(
    pending.toolName, args, workspace.tenantId, linked.adminId,
    linked.perms, hasCapability(linked.perms, "rendicion_view_all"), null,
  )) as { ok?: boolean; error?: string };

  if (!result?.ok) {
    if (responseUrl) await slackRespondUrl(responseUrl, { response_type: "ephemeral", text: `⚠️ No se pudo completar *${label}*: ${result?.error ?? "error"}` });
    return; // se mantiene PENDING (permiso insuficiente / dato inválido)
  }
  await prisma.slackPendingAction.update({ where: { id: pending.id }, data: { status: "CONFIRMED", resolvedBy: linked.adminId, resolvedAt: new Date() } });
  await updateCard(token, card, `✅ *${label}* confirmado por <@${slackUserId}>`);
  await logAudit({ action: "CREATE", entity: "SlackPendingAction", entityId: pending.id, tenantId: workspace.tenantId, userId: linked.adminId, details: { toolName: pending.toolName, kind: "TOOL_CONFIRM", via: "slack" } });
}

async function handleTicketDecision(
  workspace: ActiveWorkspace, pending: Pending, linked: LinkedAdmin,
  slackUserId: string, token: string, card: Card, responseUrl: string | undefined, approve: boolean,
): Promise<void> {
  if (pending.kind !== "TICKET_APPROVAL" || !pending.entityId) return;
  if (!hasModuleAccess(linked.perms, "ops")) {
    if (responseUrl) await slackRespondUrl(responseUrl, { response_type: "ephemeral", text: "No tienes permisos de Operaciones para decidir sobre este ticket." });
    return;
  }
  const result = await decideTicketApproval({
    tenantId: workspace.tenantId, userId: linked.adminId,
    ticketId: pending.entityId, decision: approve ? "approved" : "rejected",
  });
  if (!result.ok) {
    await prisma.slackPendingAction.update({ where: { id: pending.id }, data: { status: "EXPIRED", resolvedBy: linked.adminId, resolvedAt: new Date() } });
    await updateCard(token, card, `⌛ ${result.error ?? "Este ticket ya fue resuelto."}`);
    return;
  }
  await prisma.slackPendingAction.update({ where: { id: pending.id }, data: { status: "CONFIRMED", resolvedBy: linked.adminId, resolvedAt: new Date() } });
  const verb = approve ? "aprobado" : "rechazado";
  await updateCard(token, card, `${approve ? "✅" : "❌"} Ticket *${result.ticketCode ?? ""}* ${verb} por <@${slackUserId}>`);
  await logAudit({ action: "UPDATE", entity: "OpsTicket", entityId: pending.entityId, tenantId: workspace.tenantId, userId: linked.adminId, details: { decision: approve ? "approved" : "rejected", via: "slack" } });
}
