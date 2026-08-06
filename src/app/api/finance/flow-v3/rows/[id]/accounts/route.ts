import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import {
  listAccountsForRow,
  setAccountsForRow,
} from "@/modules/finance/flow-v3/rowAccount.service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const putSchema = z.object({
  accountPlanIds: z.array(z.string().uuid()).max(50),
  defaultTargetAccountPlanId: z.string().uuid().nullable().optional(),
});

/** GET /api/finance/flow-v3/rows/[id]/accounts */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const { id } = await params;
    const row = await prisma.financeFlowRow.findFirst({
      where: { id, tenantId: guard.ctx.tenantId, archivedAt: null },
      select: { id: true },
    });
    if (!row) {
      return NextResponse.json(
        { success: false, error: "Renglón no encontrado" },
        { status: 404 },
      );
    }
    const data = await listAccountsForRow(guard.ctx.tenantId, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/FlowV3] GET row accounts:", error);
    return flowV3Error(error);
  }
}

/** PUT /api/finance/flow-v3/rows/[id]/accounts */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const { id } = await params;
    const parsed = putSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    const { updateRow } = await import("@/modules/finance/flow-v3/rows.service");
    const { setDefaultTarget } = await import(
      "@/modules/finance/flow-v3/rowAccount.service"
    );
    // updateRow aplica guardas de sección/bandeja y mapping ACCOUNTS.
    await updateRow(guard.ctx.tenantId, id, {
      accountPlanIds: parsed.data.accountPlanIds,
    });
    if (
      parsed.data.defaultTargetAccountPlanId &&
      parsed.data.accountPlanIds.includes(parsed.data.defaultTargetAccountPlanId)
    ) {
      await setDefaultTarget(
        guard.ctx.tenantId,
        id,
        parsed.data.defaultTargetAccountPlanId,
      );
    }
    const data = await listAccountsForRow(guard.ctx.tenantId, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/FlowV3] PUT row accounts:", error);
    return flowV3Error(error);
  }
}
