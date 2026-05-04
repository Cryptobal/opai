/**
 * Calcula el estado de configuración de plataforma para una instalación.
 * Usado por el modal y el hub de onboarding.
 */

import { prisma } from "@/lib/prisma";

export type PlatformConfigStatus = {
  instalacionCreated: boolean;
  puestosCreated: boolean;
  pautaCurrentMonth: boolean;
  rondasConfigured: boolean;
  marcacionConfigured: boolean;
  testConocimientoConfigured: boolean;
};

export async function getPlatformConfigStatus(
  tenantId: string,
  installationId: string | null,
): Promise<PlatformConfigStatus> {
  if (!installationId) {
    return {
      instalacionCreated: false,
      puestosCreated: false,
      pautaCurrentMonth: false,
      rondasConfigured: false,
      marcacionConfigured: false,
      testConocimientoConfigured: false,
    };
  }

  const inst = await prisma.crmInstallation.findFirst({
    where: { id: installationId, tenantId },
    select: { id: true, marcacionCode: true },
  });
  if (!inst) {
    return {
      instalacionCreated: false,
      puestosCreated: false,
      pautaCurrentMonth: false,
      rondasConfigured: false,
      marcacionConfigured: false,
      testConocimientoConfigured: false,
    };
  }

  const now = new Date();
  const startCurrent = new Date(now.getFullYear(), now.getMonth(), 1);
  const startNextNext = new Date(now.getFullYear(), now.getMonth() + 2, 1);

  const [puestosCount, pautaCount, checkpointsCount, examsCount] =
    await Promise.all([
      prisma.opsPuestoOperativo.count({ where: { installationId } }),
      prisma.opsPautaMensual.count({
        where: {
          installationId,
          date: { gte: startCurrent, lt: startNextNext },
        },
      }),
      prisma.opsCheckpoint.count({ where: { installationId } }),
      prisma.exam.count({ where: { installationId } }),
    ]);

  return {
    instalacionCreated: true,
    puestosCreated: puestosCount > 0,
    pautaCurrentMonth: pautaCount > 0,
    rondasConfigured: checkpointsCount > 0,
    marcacionConfigured: !!inst.marcacionCode,
    testConocimientoConfigured: examsCount > 0,
  };
}
