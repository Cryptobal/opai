import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import {
  applyNoteToFuturePlanCells,
  upsertCellNote,
} from "@/modules/finance/flow-v3/cell-note.service";
import { flowCellNoteUpsertSchema } from "@/lib/validations/flow-v3";

export const dynamic = "force-dynamic";

/** Upsert / borrado de nota de celda (body vacío ⇒ delete). */
export async function PATCH(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const parsed = flowCellNoteUpsertSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    const { rowId, weekStart, body, applyToFuturePlanCells } = parsed.data;
    if (applyToFuturePlanCells) {
      const result = await applyNoteToFuturePlanCells(
        guard.ctx.tenantId,
        rowId,
        weekStart,
        body,
        guard.ctx.userId,
      );
      return NextResponse.json({
        success: true,
        data: {
          rowId,
          weekStart,
          body: (body ?? "").trim() || null,
          updatedBy: guard.ctx.userId,
          appliedWeeks: result.weeks,
        },
      });
    }
    const note = await upsertCellNote(
      guard.ctx.tenantId,
      rowId,
      weekStart,
      body,
      guard.ctx.userId,
    );
    return NextResponse.json({ success: true, data: note });
  } catch (error) {
    console.error("[Finance/FlowV3] PATCH plan/note:", error);
    return flowV3Error(error);
  }
}
