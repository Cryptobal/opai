import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_view")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await context.params;
    const items = await prisma.financeCashflowItem.findMany({
      where: { tenantId: ctx.tenantId, categoryId: id },
      select: {
        id: true,
        name: true,
        description: true,
        amount: true,
        currency: true,
        recurrence: true,
        dayOfMonth: true,
        dayOfWeek: true,
        monthOfYear: true,
        startDate: true,
        endDate: true,
        isActive: true,
        source: true,
        kind: true,
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("[Finance/Cashflow] GET category items:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
