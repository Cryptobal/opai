/**
 * Handler de los block_actions de la bandeja unificada (Fase 13): Aprobar
 * (inline), Rechazar (→ modal de motivo) y paginar por sección. Aislamiento:
 * tenant por team_id, identidad por vínculo, capability real del que presiona.
 */

import { prisma } from "@/lib/prisma";
import type { RolePermissions } from "@/lib/permissions";
import { hasCapability, hasModuleAccess } from "@/lib/permissions";
import { decideTicketApproval } from "@/lib/tickets-approvals";
import { approveRendicion } from "@/lib/rendiciones-approvals";
import { approveTe } from "@/lib/te-approvals";
import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackUpdateView, slackPushView } from "../api";
import { unpackMetadata } from "../modals/views";
import { rejectReasonView } from "./reason-modal";
import { buildInboxView, parsePages } from "./inbox";

function canApprove(domain: string, perms: RolePermissions): boolean {
  if (domain === "rendicion") return hasCapability(perms, "rendicion_approve");
  if (domain === "te") return hasCapability(perms, "te_approve");
  return hasModuleAccess(perms, "ops");
}

export async function handleInboxAction(payload: Record<string, unknown>): Promise<void> {
  const teamId = (payload.team as { id?: string } | undefined)?.id;
  const slackUserId = (payload.user as { id?: string } | undefined)?.id;
  const triggerId = payload.trigger_id as string | undefined;
  const view = payload.view as { id?: string; private_metadata?: string } | undefined;
  const action = (payload.actions as Array<{ action_id?: string; value?: string }> | undefined)?.[0];
  if (!teamId || !slackUserId || !action?.action_id || !action.value) return;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;

  const pages = parsePages(unpackMetadata(view?.private_metadata).page);
  const tenantId = workspace.tenantId;
  const refresh = async (notice?: string) => {
    if (view?.id) await slackUpdateView(workspace.botToken, view.id, await buildInboxView(tenantId, linked.adminId, linked.perms, pages, notice));
  };

  if (action.action_id === "apx_page") {
    const [domain, dir] = action.value.split(":");
    if (domain === "ticket" || domain === "rendicion" || domain === "te") {
      pages[domain] = dir === "next" ? pages[domain] + 1 : Math.max(1, pages[domain] - 1);
    }
    await refresh();
    return;
  }

  if (action.action_id === "apx_reject") {
    const [domain, id, ...rest] = action.value.split(":");
    const label = rest.join(":") || "este ítem";
    if (!triggerId || !id) return;
    await slackPushView(workspace.botToken, triggerId, rejectReasonView({ domain: domain as never, entityId: id, origin: "inbox", label }));
    return;
  }

  if (action.action_id === "apx_approve") {
    const [domain, id] = action.value.split(":");
    if (!id) return;
    if (!canApprove(domain, linked.perms)) { await refresh("⚠️ No tienes permiso para aprobar este ítem."); return; }
    const admin = await prisma.admin.findUnique({ where: { id: linked.adminId }, select: { name: true, email: true } });
    const actorName = admin?.name ?? admin?.email ?? "un aprobador";
    let notice = "✅ Aprobado.";
    if (domain === "ticket") {
      const r = await decideTicketApproval({ tenantId, userId: linked.adminId, ticketId: id, decision: "approved" });
      notice = r.ok ? `✅ Ticket *${r.ticketCode ?? ""}* aprobado.` : `⚠️ ${r.error ?? "No se pudo aprobar."}`;
    } else if (domain === "rendicion") {
      const r = await approveRendicion({ tenantId, actorId: linked.adminId, actorName, rendicionId: id });
      notice = r.ok ? `✅ Rendición *${r.code}* aprobada.` : `⚠️ ${r.error}`;
    } else if (domain === "te") {
      const r = await approveTe({ tenantId, actorId: linked.adminId, actorEmail: admin?.email, teId: id });
      notice = r.ok ? "✅ Turno extra aprobado." : `⚠️ ${r.error}`;
    }
    await refresh(notice);
  }
}
