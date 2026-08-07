import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Actor de auditoría para webhooks inbound (Web4Leads / cartola email)
 * que no tienen sesión de usuario. Prefiere owner activo; si no hay,
 * cualquier admin activo del tenant.
 */
export async function resolveInboundActorId(
  tenantId: string,
): Promise<string | null> {
  const owner = await prisma.admin.findFirst({
    where: { tenantId, status: "active", role: "owner" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (owner) return owner.id;

  const admin = await prisma.admin.findFirst({
    where: { tenantId, status: "active" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return admin?.id ?? null;
}
