import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  listMappingsForCategory,
  setMappingsForCategory,
} from "@/modules/finance/cashflow/categoryAccount.service";
import { prisma } from "@/lib/prisma";

const setMappingsSchema = z.object({
  accountPlanIds: z.array(z.string().uuid()).max(50),
});

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
    const cat = await prisma.financeCashflowCategory.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!cat) {
      return NextResponse.json(
        { success: false, error: "Categoría no encontrada" },
        { status: 404 },
      );
    }
    const mappings = await listMappingsForCategory(ctx.tenantId, id);
    return NextResponse.json({ success: true, data: mappings });
  } catch (error) {
    console.error("[Finance/Cashflow] GET category accounts:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await context.params;
    const cat = await prisma.financeCashflowCategory.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!cat) {
      return NextResponse.json(
        { success: false, error: "Categoría no encontrada" },
        { status: 404 },
      );
    }
    const parsed = await parseBody(request, setMappingsSchema);
    if (parsed.error) return parsed.error;

    // Validar que todas las cuentas pertenezcan al tenant
    if (parsed.data.accountPlanIds.length > 0) {
      const validAccounts = await prisma.financeAccountPlan.count({
        where: { tenantId: ctx.tenantId, id: { in: parsed.data.accountPlanIds } },
      });
      if (validAccounts !== parsed.data.accountPlanIds.length) {
        return NextResponse.json(
          { success: false, error: "Una o más cuentas no pertenecen al tenant" },
          { status: 400 },
        );
      }
    }

    await setMappingsForCategory(ctx.tenantId, id, parsed.data.accountPlanIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Finance/Cashflow] PUT category accounts:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
