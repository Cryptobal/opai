/**
 * Borrado de lead — mismo camino que DELETE /api/crm/leads/[id].
 * No elimina leads aprobados. Las instalaciones con leadId se desvinculan (SetNull).
 */
import { prisma } from "@/lib/prisma";

export const DELETABLE_LEAD_STATUSES = ["new", "pending", "in_review", "rejected"] as const;

export type ExecuteLeadDeleteResult =
  | { ok: true; id: string; displayName: string; status: string }
  | { ok: false; status: 400 | 404; error: string };

export function leadDisplayName(lead: {
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  email?: string | null;
}): string {
  const person = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim();
  return person || lead.companyName || lead.email || "Lead";
}

export async function executeLeadDelete(opts: {
  tenantId: string;
  leadId: string;
}): Promise<ExecuteLeadDeleteResult> {
  const existing = await prisma.crmLead.findFirst({
    where: { id: opts.leadId, tenantId: opts.tenantId },
  });
  if (!existing) {
    return { ok: false, status: 404, error: "Prospecto no encontrado" };
  }

  if (!DELETABLE_LEAD_STATUSES.includes(existing.status as (typeof DELETABLE_LEAD_STATUSES)[number])) {
    return { ok: false, status: 400, error: "No se puede eliminar un lead aprobado" };
  }

  await prisma.crmLead.delete({ where: { id: existing.id } });

  return {
    ok: true,
    id: existing.id,
    displayName: leadDisplayName(existing),
    status: existing.status,
  };
}
