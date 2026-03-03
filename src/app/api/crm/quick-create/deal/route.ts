/**
 * POST /api/crm/quick-create/deal
 * Creación rápida de negocio. Crea una cuenta automáticamente con el título del negocio.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { z } from "zod";

const quickCreateDealSchema = z.object({
  title: z.string().trim().min(1, "Nombre del negocio es requerido").max(200),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const parsed = quickCreateDealSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 }
      );
    }
    const { title } = parsed.data;

    const stage = await prisma.crmPipelineStage.findFirst({
      where: { tenantId: ctx.tenantId, isActive: true },
      orderBy: { order: "asc" },
      select: { id: true },
    });

    if (!stage) {
      return NextResponse.json(
        { success: false, error: "No hay etapas de pipeline configuradas" },
        { status: 400 }
      );
    }

    const accountName = `Negocio: ${title}`;
    const account = await prisma.crmAccount.create({
      data: {
        tenantId: ctx.tenantId,
        name: accountName,
        ownerId: ctx.userId,
        type: "prospect",
        status: "prospect",
        isActive: false,
      },
    });

    const deal = await prisma.crmDeal.create({
      data: {
        tenantId: ctx.tenantId,
        accountId: account.id,
        title,
        amount: 0,
        stageId: stage.id,
        probability: 0,
        status: "open",
      },
      include: {
        account: { select: { id: true, name: true, type: true, status: true } },
        stage: true,
        primaryContact: true,
      },
    });

    await prisma.crmDealStageHistory.create({
      data: {
        tenantId: ctx.tenantId,
        dealId: deal.id,
        fromStageId: null,
        toStageId: stage.id,
        changedBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true, data: deal }, { status: 201 });
  } catch (error) {
    console.error("[CRM] Error quick-create deal:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el negocio" },
      { status: 500 }
    );
  }
}
