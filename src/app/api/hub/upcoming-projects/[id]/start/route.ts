import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { changeDealStage } from "@/lib/crm/change-deal-stage";
import { todayInChile } from "@/lib/dates-cl";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from "@/lib/require-module";

/**
 * Marca un servicio adjudicado como iniciado.
 *
 * En CRM la transición canónica a operación es la etapa closed-won: activa
 * cuenta/instalación y ejecuta la propagación Deal ↔ Quote ↔ Installation.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const moduleCheck = await requireTenantModule("crm");
  if (!moduleCheck.authorized) return moduleCheck.response;

  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireCrmEdit(ctx, "deals");
  if (forbidden) return forbidden;

  const { id } = await params;
  const deal = await prisma.crmDeal.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      id: true,
      status: true,
      serviceStartDate: true,
      stage: {
        select: {
          isAccepted: true,
          isClosedWon: true,
        },
      },
    },
  });

  if (!deal) {
    return NextResponse.json(
      { success: false, error: "Negocio no encontrado" },
      { status: 404 },
    );
  }

  if (deal.status === "won" || deal.stage.isClosedWon) {
    return NextResponse.json({ success: true, alreadyStarted: true });
  }

  if (!deal.stage.isAccepted) {
    return NextResponse.json(
      {
        success: false,
        error: "Solo un negocio adjudicado puede marcarse como iniciado",
      },
      { status: 409 },
    );
  }

  if (!deal.serviceStartDate) {
    return NextResponse.json(
      { success: false, error: "Define primero la fecha de inicio" },
      { status: 400 },
    );
  }

  const startDate = deal.serviceStartDate.toISOString().slice(0, 10);
  if (startDate > todayInChile()) {
    return NextResponse.json(
      {
        success: false,
        error:
          "La fecha de inicio aún está en el futuro. Ajústala antes de activar el servicio.",
      },
      { status: 409 },
    );
  }

  const wonStage = await prisma.crmPipelineStage.findFirst({
    where: {
      tenantId: ctx.tenantId,
      isActive: true,
      isClosedWon: true,
    },
    orderBy: { order: "asc" },
    select: { id: true },
  });

  if (!wonStage) {
    return NextResponse.json(
      {
        success: false,
        error: "El pipeline no tiene una etapa de cierre ganado configurada",
      },
      { status: 409 },
    );
  }

  const result = await changeDealStage({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    dealId: deal.id,
    stageId: wonStage.id,
  });

  if (result.kind !== "ok") {
    const status =
      result.kind === "deal_not_found" || result.kind === "stage_not_found"
        ? 404
        : result.kind === "needs_start_date"
          ? 400
          : 500;
    return NextResponse.json(
      { success: false, error: "No se pudo iniciar el servicio" },
      { status },
    );
  }

  return NextResponse.json({
    success: true,
    data: result.data,
    ...(result.onboardingMeta ?? {}),
  });
}
