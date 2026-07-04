/**
 * API Route: /api/crm/deals/[id]/stage
 * POST - Cambiar etapa de negocio
 *
 * La lógica vive en `@/lib/crm/change-deal-stage` (extraída sin cambios de
 * comportamiento, Fase 15 B4) para reusarla desde el pipeline de Slack. El route
 * parsea el body, resuelve auth y mapea el resultado a la MISMA respuesta HTTP.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { updateDealStageSchema } from "@/lib/validations/crm";
import { requireTenantModule } from "@/lib/require-module";
import { changeDealStage } from "@/lib/crm/change-deal-stage";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "deals");
    if (forbidden) return forbidden;

    const { id } = await params;
    const parsed = await parseBody(request, updateDealStageSchema);
    if (parsed.error) return parsed.error;
    const { stageId, serviceStartDate } = parsed.data;

    const result = await changeDealStage({ tenantId: ctx.tenantId, userId: ctx.userId, dealId: id, stageId, serviceStartDate });

    switch (result.kind) {
      case "deal_not_found":
        return NextResponse.json({ success: false, error: "Negocio no encontrado" }, { status: 404 });
      case "stage_not_found":
        return NextResponse.json({ success: false, error: "Etapa no encontrada" }, { status: 404 });
      case "needs_start_date":
        return NextResponse.json({ success: false, error: "La fecha de inicio es requerida para esta etapa" }, { status: 400 });
      case "error":
        return NextResponse.json({ success: false, error: "Failed to update deal stage" }, { status: 500 });
      case "ok":
        return NextResponse.json({
          success: true,
          data: result.data,
          ...(result.onboardingMeta ?? {}),
          deactivationCandidate: result.deactivationCandidate,
        });
    }
  } catch (error) {
    console.error("Error updating CRM deal stage:", error);
    return NextResponse.json({ success: false, error: "Failed to update deal stage" }, { status: 500 });
  }
}
