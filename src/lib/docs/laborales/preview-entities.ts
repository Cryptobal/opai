import { prisma } from "@/lib/prisma";
import {
  buildGuardiaEntityData,
  enrichGuardiaWithSalary,
  loadEmpresaEntityData,
  type EntityData,
} from "@/lib/docs/token-resolver";

export async function loadGuardiaPreviewEntities(
  tenantId: string,
  guardiaId: string,
): Promise<EntityData | null> {
  const guardia = await prisma.opsGuardia.findFirst({
    where: { id: guardiaId, tenantId },
    include: {
      persona: true,
      currentInstallation: {
        select: { name: true, address: true, commune: true, city: true },
      },
      bankAccounts: { where: { isDefault: true }, take: 1 },
      asignaciones: {
        where: { isActive: true },
        orderBy: { startDate: "desc" },
        take: 1,
        select: { startDate: true, isActive: true },
      },
    },
  });
  if (!guardia) return null;

  const empresa = await loadEmpresaEntityData(tenantId);
  let guardiaData = buildGuardiaEntityData(guardia as never);
  guardiaData = await enrichGuardiaWithSalary(guardiaData, guardia.id);

  const installation = guardia.currentInstallation
    ? {
        id: undefined,
        name: guardia.currentInstallation.name,
        address: guardia.currentInstallation.address,
        commune: guardia.currentInstallation.commune,
        city: guardia.currentInstallation.city,
      }
    : null;

  return {
    empresa,
    guardia: guardiaData,
    installation,
  };
}
