import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";

/**
 * POST /api/finance/cost-centers/sync-installations
 *
 * Sincroniza instalaciones activas con finance_cost_centers:
 * - Crea un CC por cada instalación activa que no tenga uno vinculado
 * - Reactiva CCs de instalaciones que volvieron a estar activas
 * - Desactiva CCs de instalaciones que ya no están activas
 */
export async function POST() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para sincronizar centros de costo" },
        { status: 403 },
      );
    }

    const { tenantId } = ctx;

    // 1. Obtener todas las instalaciones del tenant
    const installations = await prisma.crmInstallation.findMany({
      where: { tenantId },
      select: { id: true, name: true, status: true, accountId: true },
    });

    // 2. Obtener todos los CCs vinculados a instalaciones (origen automático)
    const existingCCs = await prisma.financeCostCenter.findMany({
      where: { tenantId, installationId: { not: null } },
      select: { id: true, installationId: true, active: true, name: true },
    });

    const ccByInstallation = new Map(
      existingCCs.map((cc) => [cc.installationId!, cc]),
    );

    let created = 0;
    let reactivated = 0;
    let deactivated = 0;

    for (const inst of installations) {
      const isActive = inst.status === "active";
      const existing = ccByInstallation.get(inst.id);

      if (!existing) {
        if (isActive) {
          // Crear CC para instalación activa sin CC
          await prisma.financeCostCenter.create({
            data: {
              tenantId,
              name: inst.name,
              installationId: inst.id,
              accountId: inst.accountId ?? null,
              active: true,
            },
          });
          created++;
        }
        // Si no está activa y no tiene CC, no hacer nada
      } else {
        if (isActive && !existing.active) {
          // Reactivar CC de instalación que volvió a estar activa
          await prisma.financeCostCenter.update({
            where: { id: existing.id },
            data: { active: true, name: inst.name },
          });
          reactivated++;
        } else if (!isActive && existing.active) {
          // Desactivar CC de instalación que ya no está activa
          await prisma.financeCostCenter.update({
            where: { id: existing.id },
            data: { active: false },
          });
          deactivated++;
        } else if (isActive && existing.name !== inst.name) {
          // Sincronizar nombre si cambió
          await prisma.financeCostCenter.update({
            where: { id: existing.id },
            data: { name: inst.name },
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: { created, reactivated, deactivated },
      message: `Sincronización completada: ${created} creados, ${reactivated} reactivados, ${deactivated} desactivados`,
    });
  } catch (error) {
    console.error("[Finance] Error syncing cost centers from installations:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo sincronizar los centros de costo" },
      { status: 500 },
    );
  }
}
