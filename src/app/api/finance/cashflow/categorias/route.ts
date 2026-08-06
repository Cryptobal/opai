import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { createCategory, seedSystemCategoriesForTenant } from "@/modules/finance/cashflow/category.service";
import { createCashflowCategorySchema } from "@/lib/validations/cashflow";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_view")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const sp = new URL(request.url).searchParams;
    const kindParam = sp.get("kind");
    const kind = kindParam === "INCOME" || kindParam === "EXPENSE" ? kindParam : undefined;
    const includeInactive = sp.get("includeInactive") === "1";
    // Solo quien configura puede ver inactivas (borrado / edición en Avanzado).
    if (includeInactive && !hasCapability(perms, "cashflow_configure")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    // Upsert idempotente: asegura códigos sistema nuevos (p.ej. EGR_FINIQUITO)
    // también en tenants que ya tenían categorías sembradas.
    await seedSystemCategoriesForTenant(ctx.tenantId);

    const cats = await prisma.financeCashflowCategory.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(includeInactive ? {} : { isActive: true }),
        ...(kind && { kind }),
      },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
      include: {
        _count: { select: { accountMappings: true } },
        accountMappings: {
          include: { accountPlan: { select: { code: true, name: true } } },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
      },
    });
    return NextResponse.json({
      success: true,
      data: cats.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        kind: c.kind,
        sortOrder: c.sortOrder,
        color: c.color,
        isActive: c.isActive,
        isSystem: c.isSystem,
        isTaxExempt: c.isTaxExempt,
        mappedAccountCount: c._count.accountMappings,
        accounts: c.accountMappings.map((m) => ({
          id: m.accountPlanId,
          code: m.accountPlan.code,
          name: m.accountPlan.name,
          isPrimary: m.isPrimary,
        })),
      })),
    });
  } catch (error) {
    console.error("[Finance/Cashflow] GET categorias:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, createCashflowCategorySchema);
    if (parsed.error) return parsed.error;
    const created = await createCategory(ctx.tenantId, parsed.data);
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("[Finance/Cashflow] POST categorias:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
