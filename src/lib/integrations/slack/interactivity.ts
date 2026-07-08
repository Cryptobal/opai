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
import {
  updateAccountSchema,
  updateContactSchema,
  updateInstallationSchema,
  createLeadSchema,
} from "@/lib/validations/crm";
import { z } from "zod";
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
async function respondCard(ctx: RespondCtx, text: string, extraBlocks?: unknown[]): Promise<void> {
  const blocks = [assistantSection(text), ...(extraBlocks ?? [])];
  if (ctx.isEphemeral) {
    if (ctx.responseUrl) {
      await slackRespondUrl(ctx.responseUrl, { response_type: "ephemeral", replace_original: true, text, blocks }).catch(() => {});
    }
    return;
  }
  if (ctx.ts) await slackUpdateMessage(ctx.token, { channel: ctx.channel, ts: ctx.ts, text, blocks }).catch(() => {});
}

const UNDO_TTL_MS = 15 * 60 * 1000;

const updateDealUndoSchema = z.object({
  title: z.string().optional(),
  amount: z.number().optional(),
  probability: z.number().optional(),
  expectedCloseDate: z.string().optional().nullable(),
  primaryContactId: z.string().optional().nullable(),
  proposalLink: z.string().optional().nullable(),
  stageId: z.string().optional().nullable(),
}).partial();

const UNDO_SCHEMAS: Record<string, z.ZodTypeAny> = {
  update_account: updateAccountSchema,
  update_contact: updateContactSchema,
  update_lead: createLeadSchema.partial(),
  update_deal: updateDealUndoSchema,
  update_installation: updateInstallationSchema,
};

function undoActionsBlock(pendingId: string): unknown {
  return {
    type: "actions",
    block_id: `opai_undo_${pendingId}`,
    elements: [{
      type: "button",
      action_id: "pending_undo",
      value: pendingId,
      text: { type: "plain_text", text: "↩︎ Deshacer (15 min)", emoji: true },
    }],
  };
}

function isScalarOrNull(v: unknown): boolean {
  return v === null || ["string", "number", "boolean"].includes(typeof v);
}

function canOfferUndo(previousValues: Record<string, unknown>): boolean {
  const keys = Object.keys(previousValues);
  return keys.length > 0 && keys.every((k) => isScalarOrNull(previousValues[k]));
}

/** Filtra campos que el schema de update rechazaría (p. ej. null en campos no-nullable). */
function buildUndoToolArgs(
  toolName: string,
  entityId: string,
  previousValues: Record<string, unknown>,
): { args: Record<string, unknown>; omitted: string[] } {
  const schema = UNDO_SCHEMAS[toolName];
  const omitted: string[] = [];
  const accepted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(previousValues)) {
    const candidate = { id: entityId, ...accepted, [key]: value };
    if (schema?.safeParse({ ...candidate, id: undefined }).success) {
      accepted[key] = value;
    } else {
      omitted.push(key);
    }
  }
  return { args: { id: entityId, ...accepted }, omitted };
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
  if (actionId?.startsWith("opai_action_open")) {
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
  if (actionId?.startsWith("tcard")) {
    const { handleTicketCardAction } = await import("./tickets/tray-dispatch");
    await handleTicketCardAction(payload as unknown as Record<string, unknown>);
    return;
  }

  // Bandeja de aprobaciones UNIFICADA (Fase 13): Aprobar / Rechazar / paginar.
  if (actionId?.startsWith("apx_")) {
    const { handleInboxAction } = await import("./approvals/inbox-actions");
    await handleInboxAction(payload as unknown as Record<string, unknown>);
    return;
  }

  // "Mis rendiciones" (Fase 13): filtro por estado.
  if (actionId?.startsWith("misren_")) {
    const { handleMisRendicionesAction } = await import("./modals/mis-rendiciones");
    await handleMisRendicionesAction(payload as unknown as Record<string, unknown>);
    return;
  }

  // Aprobar/Rechazar desde la TARJETA de notificación (Fase 13).
  if (actionId?.startsWith("apcard_")) {
    const { handleApprovalCardAction } = await import("./approvals/cards");
    await handleApprovalCardAction(payload as unknown as Record<string, unknown>);
    return;
  }

  // Cockpit comercial (Fase 15): bandeja de leads y tarjeta-cockpit del new_lead.
  if (actionId?.startsWith("leadtray_")) {
    const { handleLeadTrayAction } = await import("./comercial/leads-dispatch");
    await handleLeadTrayAction(payload as never);
    return;
  }
  if (actionId?.startsWith("leadcard_")) {
    const { handleLeadCardAction } = await import("./comercial/leads-dispatch");
    await handleLeadCardAction(payload as never);
    return;
  }

  // Momento caliente (Fase 15): ⏰ Recordar 1h de la tarjeta quote_viewed.
  if (actionId?.startsWith("quoteviewed_")) {
    const { handleQuoteViewedAction } = await import("./comercial/quote-viewed");
    await handleQuoteViewedAction(payload as never);
    return;
  }

  // Pipeline comercial (Fase 15): overview → drill + acciones de deal.
  if (actionId?.startsWith("pipe_")) {
    const { handlePipelineAction } = await import("./comercial/pipeline");
    await handlePipelineAction(payload as never);
    return;
  }
  // Buscador universal de negocios (Fase 21): chips de alcance / abrir sala.
  if (actionId?.startsWith("dsearch_")) {
    const { handleDealSearchAction } = await import("./comercial/deal-search");
    await handleDealSearchAction(payload as never);
    return;
  }
  // Buscador de cuentas (Fase 1): "Ver negocios" abre el buscador pre-filtrado.
  if (actionId?.startsWith("acct_")) {
    const { handleAccountSearchAction } = await import("./comercial/account-search-modal");
    await handleAccountSearchAction(payload as never);
    return;
  }
  // Bandeja "Mis negocios" (Fase 5): avanzar / interacción / abrir sala.
  if (actionId?.startsWith("mydeals_")) {
    const { handleMyDealsAction } = await import("./comercial/my-deals-tray");
    await handleMyDealsAction(payload as never);
    return;
  }
  // Ficha viva de una Deal Room (Fase 16): Avanzar etapa / Nota.
  if (actionId?.startsWith("dealroom_")) {
    const { handleDealRoomAction } = await import("./deal-rooms/actions");
    await handleDealRoomAction(payload as never);
    return;
  }
  // Bandeja de cotizaciones (Fase 15): filtros / paginación.
  if (actionId?.startsWith("quotestray_")) {
    const { handleQuotesTrayAction } = await import("./comercial/quotes-tray");
    await handleQuotesTrayAction(payload as never);
    return;
  }
  // Loop anti-olvido (Fase 15): Reenviar / Posponer / Marcar perdida de la tarjeta 48h.
  if (actionId?.startsWith("qstale_")) {
    const { handleStaleQuoteAction } = await import("./comercial/quote-stale");
    await handleStaleQuoteAction(payload as never);
    return;
  }
  // Barrido de negocios estancados (Fase 5): Avanzar / Nota / Posponer / Perdido.
  if (actionId?.startsWith("dealstale_")) {
    const { handleStaleDealAction } = await import("./comercial/deal-stale");
    await handleStaleDealAction(payload as never);
    return;
  }
  // Bandeja de documentos por vencer (Fase 18): abrir / filtros / paginación.
  if (actionId?.startsWith("docstray_")) {
    const { handleDocsTrayAction } = await import("./docs/tray-dispatch");
    await handleDocsTrayAction(payload as never);
    return;
  }
  // Tarjeta de documento por vencer (Fase 18): En trámite / Ya no aplica.
  if (actionId?.startsWith("doccard_")) {
    const { handleDocCardAction } = await import("./docs/card-actions");
    await handleDocCardAction(payload as never);
    return;
  }

  // Tablero de relevo (control de asistencia): botones por guardia entrante.
  if (actionId?.startsWith("asist_camino_")) {
    const { handleAsistenciaCamino } = await import("./actions/asistencia");
    await handleAsistenciaCamino(payload as unknown as Record<string, unknown>);
    return;
  }
  if (actionId?.startsWith("asist_confirmar_")) {
    const { handleAsistenciaConfirmar } = await import("./actions/asistencia");
    await handleAsistenciaConfirmar(payload as unknown as Record<string, unknown>);
    return;
  }
  if (actionId?.startsWith("asist_ausente_")) {
    const { handleAsistenciaAusente } = await import("./actions/asistencia");
    await handleAsistenciaAusente(payload as unknown as Record<string, unknown>);
    return;
  }

  if (actionId === "reminder_done") {
    const { handleReminderDoneAction } = await import("./reminder-actions");
    await handleReminderDoneAction(payload);
    return;
  }

  if (actionId === "brief_toggle") {
    const { handleBriefToggleAction } = await import("./daily-brief-actions");
    await handleBriefToggleAction(payload);
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

  // Propiedad: solo quien pidió la acción del bot puede confirmarla o
  // cancelarla (las decisiones de tickets siguen siendo multi-aprobador).
  if ((actionId === "pending_confirm" || actionId === "pending_cancel" || actionId === "pending_undo") &&
      pending.requestedBySlackUserId && pending.requestedBySlackUserId !== slackUserId) {
    if (responseUrl) await slackRespondUrl(responseUrl, { response_type: "ephemeral", text: `Solo <@${pending.requestedBySlackUserId}> (quien pidió esta acción) puede confirmarla o cancelarla.` });
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
  if (actionId === "pending_undo") return handleToolUndo(workspace, pending, linked, ctx);
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
  let result: { ok?: boolean; error?: string; data?: { previousValues?: Record<string, unknown> } };
  try {
    result = (await executeToolCallV2(
      pending.toolName, args, workspace.tenantId, linked.adminId,
      linked.perms, hasCapability(linked.perms, "rendicion_view_all"), null,
    )) as { ok?: boolean; error?: string; data?: { previousValues?: Record<string, unknown> } };
  } catch (err) {
    console.error(`[slack] confirm ${pending.toolName} lanzó excepción:`, err);
    result = { ok: false, error: "error inesperado" };
  }

  if (!result?.ok) {
    await restorePending(pending.id); // permite reintento (permiso/dato inválido/transitorio)
    if (ctx.responseUrl) await slackRespondUrl(ctx.responseUrl, { response_type: "ephemeral", text: `⚠️ No se pudo completar *${label}*: ${result?.error ?? "error"}` });
    return;
  }

  let extraBlocks: unknown[] | undefined;
  const entityId = typeof args.id === "string" ? args.id : "";
  const previousValues = result.data?.previousValues;
  if (
    pending.toolName?.startsWith("update_") &&
    previousValues &&
    canOfferUndo(previousValues) &&
    entityId
  ) {
    const { args: undoArgs, omitted } = buildUndoToolArgs(pending.toolName, entityId, previousValues);
    if (Object.keys(undoArgs).length > 1) {
      const undoPa = await prisma.slackPendingAction.create({
        data: {
          tenantId: workspace.tenantId,
          workspaceId: pending.workspaceId,
          kind: "TOOL_UNDO",
          toolName: pending.toolName,
          toolArgs: undoArgs as object,
          requestedBySlackUserId: pending.requestedBySlackUserId,
          channelId: pending.channelId,
          messageTs: ctx.ts,
          status: "PENDING",
          expiresAt: new Date(Date.now() + UNDO_TTL_MS),
        },
        select: { id: true },
      });
      extraBlocks = [undoActionsBlock(undoPa.id)];
      await respondCard(
        ctx,
        `✅ *${label}* confirmado por <@${ctx.slackUserId}>`,
        extraBlocks,
      );
      refreshHome(workspace.tenantId, ctx.slackUserId);
      await logAudit({ action: "CREATE", entity: "SlackPendingAction", entityId: pending.id, tenantId: workspace.tenantId, userId: linked.adminId, details: { toolName: pending.toolName, kind: "TOOL_CONFIRM", via: "slack" } });
      return;
    }
  }

  await respondCard(ctx, `✅ *${label}* confirmado por <@${ctx.slackUserId}>`, extraBlocks);
  refreshHome(workspace.tenantId, ctx.slackUserId);
  await logAudit({ action: "CREATE", entity: "SlackPendingAction", entityId: pending.id, tenantId: workspace.tenantId, userId: linked.adminId, details: { toolName: pending.toolName, kind: "TOOL_CONFIRM", via: "slack" } });
}

async function handleToolUndo(
  workspace: ActiveWorkspace, pending: Pending, linked: LinkedAdmin, ctx: RespondCtx,
): Promise<void> {
  if (pending.kind !== "TOOL_UNDO" || !pending.toolName) return;
  const label = WRITE_TOOL_LABELS[pending.toolName] ?? pending.toolName;

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
    console.error(`[slack] undo ${pending.toolName} lanzó excepción:`, err);
    result = { ok: false, error: "error inesperado" };
  }

  if (!result?.ok) {
    await restorePending(pending.id);
    if (ctx.responseUrl) await slackRespondUrl(ctx.responseUrl, { response_type: "ephemeral", text: `⚠️ No se pudo deshacer *${label}*: ${result?.error ?? "error"}` });
    return;
  }

  const entityId = typeof args.id === "string" ? args.id : "";
  const undoFields = Object.fromEntries(Object.entries(args).filter(([k]) => k !== "id"));
  const { omitted } = entityId
    ? buildUndoToolArgs(pending.toolName, entityId, undoFields)
    : { omitted: [] as string[] };
  const partialNote = omitted.length ? ` (revertido parcialmente: ${omitted.join(", ")})` : "";

  await respondCard(ctx, `↩︎ *${label}* revertido por <@${ctx.slackUserId}>${partialNote}`);
  refreshHome(workspace.tenantId, ctx.slackUserId);
  await logAudit({
    action: "UPDATE", entity: "SlackPendingAction", entityId: pending.id,
    tenantId: workspace.tenantId, userId: linked.adminId,
    details: { toolName: pending.toolName, kind: "TOOL_UNDO", via: "slack" },
  });
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
