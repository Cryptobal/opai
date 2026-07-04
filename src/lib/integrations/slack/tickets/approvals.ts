/**
 * Fuente de datos de tickets pendientes de MI aprobación (Fase 7 → Fase 13).
 *
 * La bandeja modal ahora es multi-dominio y vive en `../approvals/inbox.ts`;
 * este archivo expone solo el LISTADO de tickets (por usuario o por grupo, paso
 * actual) para que el inbox unificado lo consuma junto a rendiciones y TEs.
 */

import { prisma } from "@/lib/prisma";

export interface TicketApprovalRow {
  id: string;
  code: string;
  title: string;
  priority: string;
  slaBreached: boolean;
}

async function myGroupIds(userId: string): Promise<string[]> {
  const rows = await prisma.adminGroupMembership.findMany({ where: { adminId: userId }, select: { groupId: true } });
  return rows.map((g) => g.groupId);
}

function mineFilter(userId: string, groupIds: string[]) {
  return (t: { currentApprovalStep: number | null; approvals: Array<{ stepOrder: number; approverGroupId: string | null; approverUserId: string | null }> }) =>
    t.approvals.some(
      (a) =>
        a.stepOrder === t.currentApprovalStep &&
        (a.approverUserId === userId || (a.approverGroupId != null && groupIds.includes(a.approverGroupId))),
    );
}

export async function listMyApprovals(
  tenantId: string,
  userId: string,
  opts?: { skip?: number; take?: number },
): Promise<TicketApprovalRow[]> {
  const groupIds = await myGroupIds(userId);
  const tickets = await prisma.opsTicket.findMany({
    where: { tenantId, status: "pending_approval" },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true, code: true, title: true, priority: true, slaBreached: true, currentApprovalStep: true,
      approvals: { where: { decision: "pending" }, select: { stepOrder: true, approverGroupId: true, approverUserId: true } },
    },
  });
  const mine = tickets.filter(mineFilter(userId, groupIds));
  const page = opts ? mine.slice(opts.skip ?? 0, (opts.skip ?? 0) + (opts.take ?? mine.length)) : mine;
  return page.map((t) => ({ id: t.id, code: t.code, title: t.title, priority: t.priority, slaBreached: t.slaBreached }));
}

export async function countMyApprovals(tenantId: string, userId: string): Promise<number> {
  const groupIds = await myGroupIds(userId);
  const tickets = await prisma.opsTicket.findMany({
    where: { tenantId, status: "pending_approval" },
    select: {
      currentApprovalStep: true,
      approvals: { where: { decision: "pending" }, select: { stepOrder: true, approverGroupId: true, approverUserId: true } },
    },
  });
  return tickets.filter(mineFilter(userId, groupIds)).length;
}
