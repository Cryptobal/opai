import { prisma } from "@/lib/prisma";

/**
 * Get the active monitoring turno ID for a tenant.
 * Returns null if no turno is currently active.
 */
export async function getActiveTurnoId(tenantId: string): Promise<string | null> {
  const turno = await prisma.opsMonitoreoTurno.findFirst({
    where: {
      tenantId,
      status: "active",
    },
    select: { id: true },
    orderBy: { startedAt: "desc" },
  });
  return turno?.id ?? null;
}
