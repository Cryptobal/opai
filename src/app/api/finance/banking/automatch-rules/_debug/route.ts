import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Endpoint de DIAGNÓSTICO para entender por qué las reglas auto-match
 * "desaparecen" para algunos usuarios. Retorna:
 *
 *   - sesión: tenantId, userId, email actuales
 *   - mySetCount: reglas que VE el usuario con la query real (mismo
 *     `where` que listRules)
 *   - totalRules: total de reglas en la BD sin filtro de tenant
 *   - byTenant: distribución de reglas por tenantId (para detectar si
 *     están creadas en otro tenant)
 *   - sample: primeras 10 reglas del usuario (id, name, enabled,
 *     priority, tenantId, createdAt, createdBy)
 *   - userTenants: si el usuario está en TenantUser, qué tenants tiene.
 *
 * Sin permisos especiales — solo auth — porque devuelve info muy
 * limitada y es para diagnóstico rápido en producción.
 */
export async function GET(_request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const [mySet, totalRules, byTenantRaw, sample] = await Promise.all([
      prisma.financeAutoMatchRule.count({ where: { tenantId: ctx.tenantId } }),
      prisma.financeAutoMatchRule.count(),
      prisma.financeAutoMatchRule.groupBy({
        by: ["tenantId"],
        _count: { _all: true },
        orderBy: { _count: { tenantId: "desc" } },
        take: 20,
      }),
      prisma.financeAutoMatchRule.findMany({
        where: { tenantId: ctx.tenantId },
        select: {
          id: true,
          name: true,
          enabled: true,
          priority: true,
          tenantId: true,
          createdAt: true,
          createdById: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    // Si el modelo TenantUser/UserTenant existe, intentar listar los
    // tenants asociados al usuario. Falla soft si no existe.
    let userTenants: unknown = "tabla no encontrada o sin datos";
    try {
      const rows = await prisma.$queryRawUnsafe<
        { tenant_id: string }[]
      >(
        `SELECT DISTINCT tenant_id FROM "User" WHERE id = $1 OR email = $2`,
        ctx.userId,
        ctx.userEmail
      );
      userTenants = rows;
    } catch (err) {
      userTenants = `error: ${err instanceof Error ? err.message : "unknown"}`;
    }

    return NextResponse.json(
      {
        success: true,
        session: {
          userId: ctx.userId,
          tenantId: ctx.tenantId,
          email: ctx.userEmail,
          role: ctx.userRole,
        },
        rules: {
          mySetCount: mySet,
          totalAcrossAllTenants: totalRules,
          byTenant: byTenantRaw.map((r) => ({
            tenantId: r.tenantId,
            count: r._count._all,
            isCurrent: r.tenantId === ctx.tenantId,
          })),
          sample,
        },
        userTenants,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[Finance/Banking/Rules/_debug] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error de diagnóstico",
      },
      { status: 500 }
    );
  }
}
