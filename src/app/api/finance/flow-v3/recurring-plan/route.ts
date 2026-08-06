import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import {
  createRecurrence,
  listRecurrencesForRow,
  toRecurrenceDto,
} from "@/modules/finance/flow-v3/recurring-plan.service";
import { flowRecurringPlanCreateSchema } from "@/lib/validations/flow-v3";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Lista las reglas recurrentes de una fila (para editar/eliminar desde el menú). */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_view");
    if (guard.error) return guard.error;
    const rowId = request.nextUrl.searchParams.get("rowId");
    if (!rowId) {
      return NextResponse.json(
        { success: false, error: "rowId requerido" },
        { status: 400 },
      );
    }
    const row = await prisma.financeFlowRow.findFirst({
      where: { id: rowId, tenantId: guard.ctx.tenantId },
      select: { id: true },
    });
    if (!row) {
      return NextResponse.json(
        { success: false, error: "Fila no encontrada" },
        { status: 404 },
      );
    }
    const rules = await listRecurrencesForRow(guard.ctx.tenantId, rowId);
    return NextResponse.json({
      success: true,
      data: rules.map(toRecurrenceDto),
    });
  } catch (error) {
    console.error("[Finance/FlowV3] GET recurring-plan:", error);
    return flowV3Error(error);
  }
}

/** Crea una regla de egreso recurrente de plan y materializa sus celdas. */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const parsed = flowRecurringPlanCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    const { rowId, newRow, ...input } = parsed.data;
    const result = await createRecurrence(
      guard.ctx.tenantId,
      rowId,
      { ...input, newRow: newRow ?? null },
      guard.ctx.userId,
    );
    return NextResponse.json({
      success: true,
      data: { rule: toRecurrenceDto(result.rule), cells: result.cells },
    });
  } catch (error) {
    console.error("[Finance/FlowV3] POST recurring-plan:", error);
    return flowV3Error(error);
  }
}
