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

    // Check del schema real de finance_automatch_rules: necesitamos
    // saber si la migración del 11-may (created_by UUID→TEXT) está
    // aplicada en producción. Si created_by sigue siendo UUID, todo
    // INSERT con un CUID falla silenciosamente.
    let schemaCheck: unknown = "no chequeado";
    try {
      const rows = await prisma.$queryRawUnsafe<
        { column_name: string; data_type: string }[]
      >(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = 'finance'
           AND table_name = 'finance_automatch_rules'
           AND column_name IN ('id', 'created_by', 'tenant_id')
         ORDER BY column_name`
      );
      schemaCheck = rows;
    } catch (err) {
      schemaCheck = `error: ${err instanceof Error ? err.message : "unknown"}`;
    }

    // Test de creación REAL: intentamos crear una regla con el userId
    // de la sesión. Si falla, capturamos el error exacto de Postgres.
    // Si funciona, la eliminamos inmediatamente y reportamos OK.
    let testCreate: unknown = "no ejecutado";
    try {
      const created = await prisma.financeAutoMatchRule.create({
        data: {
          tenantId: ctx.tenantId,
          name: `__debug_test_${Date.now()}`,
          enabled: false,
          priority: 9999,
          appliesTo: "BOTH",
          conditions: { mode: "ANY", items: [] },
          action: { handlingMode: "CATEGORIZED", requiresReview: true },
          createdById: ctx.userId,
        },
      });
      // Cleanup inmediato — esto NO es una regla persistente.
      await prisma.financeAutoMatchRule.delete({ where: { id: created.id } });
      testCreate = {
        ok: true,
        createdId: created.id,
        cleanedUp: true,
      };
    } catch (err) {
      testCreate = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        code: (err as { code?: string })?.code,
      };
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
        schemaCheck,
        testCreate,
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
