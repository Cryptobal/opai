/**
 * Consulta de leads para la bandeja de Slack (Fase 15, B1).
 *
 * Bandeja personal-agnóstica a nivel tenant (los leads no tienen owner): filtros
 * por estado y origen, y el destacado "sin tomar" (firstContactAt: null) — que
 * es exactamente lo que persigue el cron de escalamiento. Paginado 10/página.
 */

import { prisma } from "@/lib/prisma";
import type { LeadLite } from "./lead-actions";

export const LEAD_PAGE_SIZE = 10;
/** "Activos" = por trabajar (pendiente o en revisión). */
const ACTIVE_STATUSES = ["pending", "in_review"];

export interface LeadTrayFilters {
  status?: string; // vacío = activos (pending + in_review)
  source?: string;
  untaken?: boolean; // solo sin tomar (firstContactAt null)
}

export interface LeadRow extends LeadLite {
  createdAt: Date;
}

function buildWhere(tenantId: string, filters: LeadTrayFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { tenantId };
  if (filters.status) where.status = filters.status;
  else where.status = { in: ACTIVE_STATUSES };
  if (filters.source) where.source = filters.source;
  if (filters.untaken) where.firstContactAt = null;
  return where;
}

const ROW_SELECT = {
  id: true, firstName: true, lastName: true, companyName: true, email: true, phone: true,
  commune: true, city: true, address: true, industry: true, serviceType: true,
  status: true, source: true, firstContactAt: true, firstContactBy: true, createdAt: true,
} as const;

export async function listLeads(
  tenantId: string,
  filters: LeadTrayFilters,
  page: number,
): Promise<{ rows: LeadRow[]; total: number; page: number; hasMore: boolean }> {
  const where = buildWhere(tenantId, filters);
  const p = Math.max(1, page);
  const skip = (p - 1) * LEAD_PAGE_SIZE;
  const [rows, total] = await Promise.all([
    prisma.crmLead.findMany({
      where,
      // Sin tomar primero, luego más recientes: el foco son los 5 min de oro.
      orderBy: [{ firstContactAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
      skip,
      take: LEAD_PAGE_SIZE,
      select: ROW_SELECT,
    }),
    prisma.crmLead.count({ where }),
  ]);
  return { rows, total, page: p, hasMore: skip + rows.length < total };
}

/** Solo el conteo de un filtro (para el Home comercial). */
export async function countLeads(tenantId: string, filters: LeadTrayFilters): Promise<number> {
  return prisma.crmLead.count({ where: buildWhere(tenantId, filters) });
}

/** Orígenes conocidos para el filtro (slug → label). Los desconocidos caen en "otros". */
export const LEAD_SOURCE_LABELS: Record<string, string> = {
  web: "Web",
  cotizador: "Cotizador",
  email_forward: "Email",
  web_message_promoted: "Mensaje web",
  referido: "Referido",
};
