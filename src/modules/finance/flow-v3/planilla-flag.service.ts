import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { ALL_MODULES, clearTenantModuleCache } from "@/lib/tenant-modules";

/**
 * Activa/desactiva el Modo Planilla para el tenant SIN SQL manual: escribe
 * cashflowPlanillaV3 en TenantModule(module="finanzas").config.
 *
 * Cuidado backward-compat: un tenant SIN filas TenantModule significa "todos
 * los módulos habilitados". Si creáramos solo la fila finanzas, el resto de
 * los módulos desaparecería. Por eso, en ese caso, primero se materializan
 * TODAS las filas (enabled=true) y recién entonces se setea el flag.
 */
export async function setPlanillaFlag(tenantId: string, enabled: boolean): Promise<boolean> {
  const count = await prisma.tenantModule.count({ where: { tenantId } });
  if (count === 0) {
    await prisma.tenantModule.createMany({
      data: ALL_MODULES.map((m) => ({ tenantId, module: m, enabled: true })),
      skipDuplicates: true,
    });
  }

  const finanzas = await prisma.tenantModule.findFirst({
    where: { tenantId, module: "finanzas" },
  });
  if (finanzas) {
    const cfg = (finanzas.config as Record<string, unknown> | null) ?? {};
    await prisma.tenantModule.update({
      where: { id: finanzas.id },
      data: { config: { ...cfg, cashflowPlanillaV3: enabled } as Prisma.InputJsonValue },
    });
  } else {
    // Tenant con filas parciales y sin finanzas: crearla habilitada (el
    // tenant ya usa el módulo finance si llegó hasta acá).
    await prisma.tenantModule.create({
      data: {
        tenantId,
        module: "finanzas",
        enabled: true,
        config: { cashflowPlanillaV3: enabled } as Prisma.InputJsonValue,
      },
    });
  }

  clearTenantModuleCache(tenantId);

  // Read-after-write.
  const fresh = await prisma.tenantModule.findFirst({
    where: { tenantId, module: "finanzas" },
    select: { config: true },
  });
  return (fresh?.config as Record<string, unknown> | null)?.cashflowPlanillaV3 === true;
}
