import "server-only";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const ENTITY = "FinanceFlowPlanCell";

export interface PlanHistoryEntry {
  id: string;
  createdAt: string;
  userEmail: string | null;
  previousAmount: number;
  newAmount: number;
}

function entityId(rowId: string, weekStart: string): string {
  return `${rowId}:${weekStart}`;
}

/** Registra un cambio de monto de plan (best-effort; no bloquea el write). */
export async function recordPlanChange(args: {
  tenantId: string;
  userId: string | null;
  userEmail?: string | null;
  rowId: string;
  weekStart: string;
  previousAmount: number;
  newAmount: number;
}): Promise<void> {
  if (args.previousAmount === args.newAmount) return;
  await logAudit({
    tenantId: args.tenantId,
    userId: args.userId,
    userEmail: args.userEmail,
    action: "UPDATE",
    entity: ENTITY,
    entityId: entityId(args.rowId, args.weekStart),
    details: {
      rowId: args.rowId,
      weekStart: args.weekStart,
      previousAmount: args.previousAmount,
      newAmount: args.newAmount,
    },
  });
}

/** Últimos cambios de plan de una celda (más recientes primero). */
export async function listPlanHistory(
  tenantId: string,
  rowId: string,
  weekStart: string,
  limit = 20,
): Promise<PlanHistoryEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId,
      entity: ENTITY,
      entityId: entityId(rowId, weekStart),
      action: "UPDATE",
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
    select: {
      id: true,
      createdAt: true,
      userEmail: true,
      details: true,
    },
  });

  return rows.map((r) => {
    const d = (r.details ?? {}) as {
      previousAmount?: number;
      newAmount?: number;
    };
    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      userEmail: r.userEmail,
      previousAmount: Number(d.previousAmount ?? 0),
      newAmount: Number(d.newAmount ?? 0),
    };
  });
}
