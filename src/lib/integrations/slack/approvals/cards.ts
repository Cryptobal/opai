/**
 * Aprobar / Rechazar una rendición o turno extra DESDE la tarjeta de
 * notificación (Fase 13). Aprobar es inline (anti-carrera con `claimPending`);
 * Rechazar abre el modal de motivo obligatorio (`rejectReasonView`, origin=card)
 * que al enviar actualiza la misma tarjeta. Doble decisión → la tarjeta informa
 * el estado real. Capability real del que presiona (el servicio manda).
 */

import { prisma } from "@/lib/prisma";
import { hasCapability } from "@/lib/permissions";
import { approveRendicion } from "@/lib/rendiciones-approvals";
import { approveTe } from "@/lib/te-approvals";
import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackUpdateMessage, slackRespondUrl, slackOpenView } from "../api";
import { rejectReasonView } from "./reason-modal";

const nowHHMM = () =>
  new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }).format(new Date());

async function claim(id: string, resolvedBy: string): Promise<boolean> {
  const r = await prisma.slackPendingAction.updateMany({
    where: { id, status: "PENDING", expiresAt: { gt: new Date() } },
    data: { status: "CONFIRMED", resolvedBy, resolvedAt: new Date() },
  });
  return r.count === 1;
}
async function restore(id: string): Promise<void> {
  await prisma.slackPendingAction.updateMany({ where: { id }, data: { status: "PENDING", resolvedBy: null, resolvedAt: null } }).catch(() => {});
}

export async function handleApprovalCardAction(payload: Record<string, unknown>): Promise<void> {
  const teamId = (payload.team as { id?: string } | undefined)?.id;
  const slackUserId = (payload.user as { id?: string } | undefined)?.id;
  const triggerId = payload.trigger_id as string | undefined;
  const responseUrl = payload.response_url as string | undefined;
  const action = (payload.actions as Array<{ action_id?: string; value?: string }> | undefined)?.[0];
  if (!teamId || !slackUserId || !action?.action_id || !action.value) return;

  const [domain, pendingId] = action.value.split(":");
  if ((domain !== "rendicion" && domain !== "te") || !pendingId) return;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;

  const ephemeral = (text: string) =>
    responseUrl ? slackRespondUrl(responseUrl, { response_type: "ephemeral", text }).catch(() => {}) : Promise.resolve();

  const cap = domain === "rendicion" ? "rendicion_approve" : "te_approve";
  if (!hasCapability(linked.perms, cap)) {
    await ephemeral(`No tienes permiso para aprobar ${domain === "rendicion" ? "rendiciones" : "turnos extra"}.`);
    return;
  }

  const pending = await prisma.slackPendingAction.findFirst({ where: { id: pendingId, tenantId: workspace.tenantId } });
  if (!pending?.entityId) {
    await ephemeral("Esta acción ya no está disponible.");
    return;
  }
  const card = (text: string) =>
    pending.messageTs
      ? slackUpdateMessage(workspace.botToken, { channel: pending.channelId, ts: pending.messageTs, text, blocks: [{ type: "section", text: { type: "mrkdwn", text } }] }).catch(() => {})
      : Promise.resolve();

  // Rechazar: abre el modal de motivo (origin=card); su submit actualiza la tarjeta.
  if (action.action_id === "apcard_reject") {
    if (!triggerId) return;
    await slackOpenView(workspace.botToken, triggerId, rejectReasonView({
      domain, entityId: pending.entityId, origin: "card",
      label: domain === "rendicion" ? "esta rendición" : "este turno extra",
      pendingId: pending.id, channelId: pending.channelId, messageTs: pending.messageTs ?? undefined,
    }));
    return;
  }

  if (action.action_id !== "apcard_approve") return;

  // Aprobar: reclama atómicamente (dos aprobadores no deciden en paralelo).
  if (!(await claim(pending.id, linked.adminId))) {
    await card(`ℹ️ Esta solicitud ya fue resuelta.`);
    await ephemeral("Otro aprobador ya decidió esta solicitud.");
    return;
  }

  const admin = await prisma.admin.findUnique({ where: { id: linked.adminId }, select: { name: true, email: true } });
  const actorName = admin?.name ?? admin?.email ?? "un aprobador";
  const r = domain === "rendicion"
    ? await approveRendicion({ tenantId: workspace.tenantId, actorId: linked.adminId, actorName, rendicionId: pending.entityId })
    : await approveTe({ tenantId: workspace.tenantId, actorId: linked.adminId, actorEmail: admin?.email, teId: pending.entityId });

  if (!r.ok) {
    if (!r.alreadyDecided) await restore(pending.id); // transitorio → permite reintento
    await card(r.alreadyDecided ? "ℹ️ Esta solicitud ya fue resuelta." : `⚠️ ${r.error}`);
    return;
  }
  const label = domain === "rendicion" && "code" in r ? `Rendición *${r.code}*` : "Turno extra";
  await card(`✅ ${label} aprobado por <@${slackUserId}> a las ${nowHHMM()}`);
}
