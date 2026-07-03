/**
 * Bandeja "Pendientes de mi aprobación" (Fase 7): tickets en `pending_approval`
 * cuyo paso actual me toca a mí (por usuario o por grupo). Filas con botones
 * Aprobar / Rechazar inline → `decideTicketApproval` (mismo camino que F2).
 */

import { prisma } from "@/lib/prisma";
import { TICKET_PRIORITY_CONFIG } from "@/lib/tickets";
import { decideTicketApproval } from "@/lib/tickets-approvals";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackUpdateView } from "../api";
import type { ModalDef, ModalOpenContext, SlackView } from "../modals/types";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75) });

interface Row { id: string; code: string; title: string; priority: string; slaBreached: boolean }

async function listMyApprovals(tenantId: string, userId: string): Promise<Row[]> {
  const groupIds = (
    await prisma.adminGroupMembership.findMany({ where: { adminId: userId }, select: { groupId: true } })
  ).map((g) => g.groupId);

  const tickets = await prisma.opsTicket.findMany({
    where: { tenantId, status: "pending_approval" },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true, code: true, title: true, priority: true, slaBreached: true, currentApprovalStep: true,
      approvals: { where: { decision: "pending" }, select: { stepOrder: true, approverGroupId: true, approverUserId: true } },
    },
  });

  return tickets
    .filter((t) =>
      t.approvals.some(
        (a) =>
          a.stepOrder === t.currentApprovalStep &&
          (a.approverUserId === userId || (a.approverGroupId != null && groupIds.includes(a.approverGroupId))),
      ),
    )
    .map((t) => ({ id: t.id, code: t.code, title: t.title, priority: t.priority, slaBreached: t.slaBreached }));
}

function buildView(rows: Row[]): SlackView {
  const blocks: unknown[] = [];
  if (rows.length === 0) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "No tienes aprobaciones pendientes. 🎉" } });
  }
  for (const t of rows) {
    const url = `${getCanonicalSiteUrl()}/ops/tickets/${t.id}`;
    const pr = TICKET_PRIORITY_CONFIG[t.priority as keyof typeof TICKET_PRIORITY_CONFIG]?.shortLabel ?? t.priority;
    const sla = t.slaBreached ? "  ·  🔴 SLA vencido" : "";
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `<${url}|${t.code}> · ${t.title}\n\`${pr}\`${sla}` } });
    blocks.push({
      type: "actions",
      elements: [
        { type: "button", text: pt("Aprobar"), style: "primary", action_id: "appr_decide", value: `approved:${t.id}` },
        { type: "button", text: pt("Rechazar"), style: "danger", action_id: "appr_decide", value: `rejected:${t.id}` },
      ],
    });
  }
  return { type: "modal", callback_id: "opai_aprobaciones", title: pt("Mis aprobaciones"), close: pt("Cerrar"), blocks };
}

async function build(ctx: ModalOpenContext): Promise<SlackView> {
  return buildView(await listMyApprovals(ctx.tenantId, ctx.linked.adminId));
}

export const approvalsModal: ModalDef = {
  callbackId: "opai_aprobaciones",
  title: "Mis aprobaciones",
  build,
  submit: async () => ({ ack: {} }),
};

/** block_action `appr_decide`: aprueba/rechaza y refresca la bandeja. */
export async function handleApprovalAction(payload: Record<string, unknown>): Promise<void> {
  const teamId = (payload.team as { id?: string } | undefined)?.id;
  const slackUserId = (payload.user as { id?: string } | undefined)?.id;
  const view = payload.view as { id?: string } | undefined;
  const action = (payload.actions as Array<{ value?: string }> | undefined)?.[0];
  if (!teamId || !slackUserId || !action?.value || !view?.id) return;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;

  const [decision, ticketId] = action.value.split(":");
  if ((decision === "approved" || decision === "rejected") && ticketId) {
    await decideTicketApproval({
      tenantId: workspace.tenantId, userId: linked.adminId, ticketId, decision,
    }).catch((err) => console.error("[slack] decideTicketApproval:", err));
  }
  const rows = await listMyApprovals(workspace.tenantId, linked.adminId);
  await slackUpdateView(workspace.botToken, view.id, buildView(rows));
}
