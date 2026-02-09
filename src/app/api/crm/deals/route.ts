/**
 * API Route: /api/crm/deals
 * GET  - Listar negocios
 * POST - Crear negocio
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";

export async function GET() {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());

    const deals = await prisma.crmDeal.findMany({
      where: { tenantId },
      include: {
        account: true,
        stage: true,
        primaryContact: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: deals });
  } catch (error) {
    console.error("Error fetching CRM deals:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch deals" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());
    const body = await request.json();

    if (!body?.accountId) {
      return NextResponse.json(
        { success: false, error: "accountId es requerido" },
        { status: 400 }
      );
    }

    const stage =
      body?.stageId ||
      (await prisma.crmPipelineStage.findFirst({
        where: { tenantId, isActive: true },
        orderBy: { order: "asc" },
        select: { id: true },
      }))?.id;

    if (!stage) {
      return NextResponse.json(
        { success: false, error: "No hay etapas de pipeline configuradas" },
        { status: 400 }
      );
    }

    const deal = await prisma.crmDeal.create({
      data: {
        tenantId,
        accountId: body.accountId,
        primaryContactId: body?.primaryContactId || null,
        title: body?.title?.trim() || "Negocio sin título",
        amount: body?.amount ? Number(body.amount) : 0,
        stageId: stage,
        probability: body?.probability ? Number(body.probability) : 0,
        expectedCloseDate: body?.expectedCloseDate
          ? new Date(body.expectedCloseDate)
          : null,
        status: "open",
      },
      include: {
        account: true,
        stage: true,
        primaryContact: true,
      },
    });

    await prisma.crmDealStageHistory.create({
      data: {
        tenantId,
        dealId: deal.id,
        fromStageId: null,
        toStageId: stage,
        changedBy: session?.user?.id || null,
      },
    });

    return NextResponse.json({ success: true, data: deal }, { status: 201 });
  } catch (error) {
    console.error("Error creating CRM deal:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create deal" },
      { status: 500 }
    );
  }
}
